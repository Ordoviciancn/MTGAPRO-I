import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ForgeLaunch } from './forgeProcess';
const run = promisify(execFile);
export function bundledPath(root: string, relative: unknown): string {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Invalid bundled runtime path.');
  const resolved = path.resolve(root, relative);
  const inside = path.relative(path.resolve(root), resolved);
  if (!inside || inside === '..' || inside.startsWith('..' + path.sep) || path.isAbsolute(inside)) throw new Error('Bundled runtime path escapes its directory.');
  return resolved;
}
export async function prepareForgeLaunch(root: string, javaHome: string): Promise<{ launch: ForgeLaunch; cleanup: () => Promise<void> }> {
  let source: string, classpath: string, resources: string;
  let sessionRoot = path.join(root, '.local-tools');
  const bundled = process.env.FORGE_BUNDLED_RUNTIME;
  if (bundled) {
    const manifest = JSON.parse(await readFile(path.join(bundled, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || manifest.javaRelease !== 17 || !/^[a-f0-9]{40}$/.test(manifest.forgeCommit) || !Array.isArray(manifest.classpath) || !manifest.classpath.length) throw new Error('Invalid bundled Forge runtime manifest.');
    source = bundledPath(bundled, manifest.source);
    resources = bundledPath(bundled, manifest.resources);
    const entries = manifest.classpath.map((entry: unknown) => bundledPath(bundled, entry));
    await Promise.all([source, resources, ...entries].map(file => access(file)));
    classpath = entries.join(path.delimiter);
    javaHome = path.join(bundled, 'jdk');
    if (!process.env.FORGE_SESSION_ROOT || !path.isAbsolute(process.env.FORGE_SESSION_ROOT)) throw new Error('Bundled Forge requires an absolute writable FORGE_SESSION_ROOT.');
    sessionRoot = process.env.FORGE_SESSION_ROOT;
  } else {
    const forge = path.join(root, '.local-tools/forge');
    const pin = JSON.parse(await readFile(path.join(root, 'config/forge-source.json'), 'utf8'));
    const revision = await run('git', ['-C', forge, 'rev-parse', 'HEAD'], { timeout: 10000, windowsHide: true });
    if (revision.stdout.trim() !== pin.commit) throw new Error('Forge source version does not match the pinned build.');
    source = path.join(root, 'bridge/forge/ForgeHumanBridge.java');
    await access(source);
    const dependencies = (await readFile(path.join(forge, 'forge-gui/target/runtime-classpath.txt'), 'utf8')).trim();
    classpath = [path.join(forge, 'forge-gui/target/classes'), dependencies].join(path.delimiter);
    resources = path.join(forge, 'forge-gui/res');
  }
  await access(path.join(javaHome, 'bin/java.exe'));
  await mkdir(sessionRoot, { recursive: true });
  const directory = await mkdtemp(path.join(sessionRoot, 'session-'));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    // Java 17 decodes @argfiles using the Windows system charset, corrupting Unicode paths.
    // Pass arguments through CreateProcessW instead; spawn handles spaces without shell quoting.
    const args = ['-Dfile.encoding=UTF-8', '-Djava.awt.headless=true', '-Duser.home=' + directory, '--class-path', classpath, source, resources, directory];
    return {launch:{executable:path.join(javaHome,'bin/java.exe'),args,cwd:directory,env:{...process.env,APPDATA:directory,LOCALAPPDATA:directory},startupTimeoutMs:120000},cleanup};
  } catch (error) { await cleanup(); throw error; }
}
