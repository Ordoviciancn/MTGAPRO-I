const {spawn} = require('node:child_process');

class QuickTunnel {
  constructor({executable, origin, onState = () => {}, spawnImpl = spawn, timeoutMs = 90000}) {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Quick Tunnel origin must be a loopback HTTP origin');
    }
    if (!executable) throw new Error('cloudflared executable is required');
    this.executable = executable;
    this.origin = url.origin;
    this.onState = onState;
    this.spawn = spawnImpl;
    this.timeoutMs = timeoutMs;
    this.status = {phase: 'idle'};
    this.run = null;
  }

  publish(state) {
    this.status = state;
    this.onState({...state});
  }

  start() {
    if (this.run) return this.run.promise;
    const run = {child: null, timer: null, url: null, registered: false, buffers: ['', '']};
    run.promise = new Promise(resolve => { run.resolve = resolve; });
    this.run = run;
    this.publish({phase: 'starting'});
    const fail = message => {
      if (this.run !== run) return;
      this.run = null;
      clearTimeout(run.timer);
      if (run.child && !run.child.killed) run.child.kill();
      this.publish({phase: 'error', error: message});
      run.resolve(this.status);
    };
    try {
      run.child = this.spawn(this.executable, ['tunnel', '--no-autoupdate', '--url', this.origin], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
      });
    } catch {
      fail('无法启动 Cloudflare 隧道程序。');
      return run.promise;
    }
    const read = (index, chunk) => {
      if (this.run !== run) return;
      run.buffers[index] = (run.buffers[index] + chunk.toString()).slice(-16384);
      const output = run.buffers[index];
      const match = output.match(/https:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)\.trycloudflare\.com(?=[\s/]|$)/i);
      if (match) run.url = `https://${match[1].toLowerCase()}.trycloudflare.com`;
      if (output.includes('Registered tunnel connection')) run.registered = true;
      if (run.url && run.registered && this.status.phase !== 'ready') {
        clearTimeout(run.timer);
        this.publish({phase: 'ready', url: run.url});
        run.resolve(this.status);
      }
    };
    run.child.stdout?.on('data', chunk => read(0, chunk));
    run.child.stderr?.on('data', chunk => read(1, chunk));
    run.child.on('error', () => fail('Cloudflare 隧道程序运行失败，请检查程序文件和网络。'));
    run.child.on('exit', () => fail('公网隧道已退出，请重新开启联机分享。'));
    run.timer = setTimeout(() => fail('建立公网隧道超时，请检查网络后重试。'), this.timeoutMs);
    return run.promise;
  }

  stop() {
    const run = this.run;
    this.run = null;
    if (run) {
      clearTimeout(run.timer);
      if (run.child && !run.child.killed) run.child.kill();
    }
    this.publish({phase: 'idle'});
    run?.resolve(this.status);
    return this.status;
  }
}

module.exports = {QuickTunnel};
