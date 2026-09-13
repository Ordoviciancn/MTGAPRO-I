import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
export type ForgeMessage = { type: string; [key: string]: unknown };
export type ForgeLaunch = { executable: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv; startupTimeoutMs?: number };
const PREFIX = 'FORGE_BRIDGE ';
const MAX_LINE = 1024 * 1024;
export class ForgeProcess {
  private child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private closed = false;
  private readyState = false;
  private diagnostics = '';
  readonly ready: Promise<void>;
  readonly exited: Promise<void>;
  constructor(launch: ForgeLaunch, onMessage: (message: ForgeMessage) => void, onFailure: (error: Error) => void) {
    this.child = spawn(launch.executable, launch.args, { cwd: launch.cwd, env: launch.env, windowsHide: true, stdio: 'pipe' });
    const terminateOnExit=()=>this.child.kill();
    process.once('exit',terminateOnExit);
    this.child.once('close',()=>process.removeListener('exit',terminateOnExit));
    this.exited = new Promise(resolve => this.child.once('close', () => resolve()));
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error('Forge initialization timed out.')), launch.startupTimeoutMs ?? 60000);
      const fail = (error: Error) => {
        if (this.closed) return;
        clearTimeout(timer);
        this.closed = true;
        this.child.kill();
        if(this.diagnostics)console.error('[Forge stderr]',this.diagnostics);
        reject(error);
        onFailure(error);
      };
      this.child.on('error', fail);
      this.child.stdin.on('error', fail);
      this.child.on('close', () => fail(new Error('Forge process exited.')));
      this.child.stdout.setEncoding('utf8');
      this.child.stdout.on('data', (chunk: string) => {
        if (this.closed) return;
        this.buffer += chunk;
        let split: number;
        while ((split = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, split).replace(/\r$/, '');
          this.buffer = this.buffer.slice(split + 1);
          if (line.length > MAX_LINE) return fail(new Error('Forge message exceeds size limit.'));
          if (!line.startsWith(PREFIX)) continue;
          try {
            const message = JSON.parse(line.slice(PREFIX.length));
            if (!message || Array.isArray(message) || typeof message.type !== 'string') throw new Error('Invalid Forge message.');
            if (message.type === 'ready') { this.readyState = true; clearTimeout(timer); resolve(); }
            onMessage(message);
          } catch { return fail(new Error('Forge returned an invalid protocol message.')); }
        }
        if (this.buffer.length > MAX_LINE) fail(new Error('Forge message exceeds size limit.'));
      });
      // Bound the private diagnostic tail; never send raw card names to clients.
      this.child.stderr.setEncoding('utf8');
      this.child.stderr.on('data',(chunk:string)=>{this.diagnostics=(this.diagnostics+chunk).slice(-16384);});
      this.stop = () => { clearTimeout(timer); this.closed = true; this.child.kill(); reject(new Error('Forge stopped.')); return this.exited; };
    });
  }
  send(message: ForgeMessage): void {
    if (this.closed || !this.readyState) throw new Error('Forge is not ready.');
    const line = JSON.stringify(message);
    if (line.length > MAX_LINE) throw new Error('Forge command exceeds size limit.');
    if (this.child.stdin.writableLength > MAX_LINE) throw new Error('Forge input queue is full.');
    this.child.stdin.write(line + '\n');
  }
  stop(): Promise<void> { this.closed = true; this.child.kill(); return this.exited; }
}
