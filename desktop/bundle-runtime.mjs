import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);

export async function buildBundledRuntime(root, stage, javaHome) {
  const forge = path.join(root, '.local-tools/forge');
  const pin = JSON.parse(await readFile(path.join(root, 'config/forge-source.json'), 'utf8'));
  const revision = await run('git', ['-C', forge, 'rev-parse', 'HEAD'], { windowsHide: true });
  if (revision.stdout.trim() !== pin.commit) throw new Error('Forge build does not match config/forge-source.json.');
  const changes = await run('git', ['-C', forge, 'diff', '--name-only', 'HEAD'], { windowsHide: true });
  if (changes.stdout.trim()) throw new Error('Forge tracked sources have modifications; rebuild from the pinned source before distribution.');
  await access(path.join(javaHome, 'bin/javac.exe'));
  const release = await readFile(path.join(javaHome, 'release'), 'utf8');
  if (!release.includes('IMPLEMENTOR="Eclipse Adoptium"') || !release.includes('JAVA_VERSION="17.')) {
    throw new Error('Distribution requires the verified Eclipse Temurin JDK 17, including its legal directory.');
  }
  const runtime = path.join(stage, 'runtime');
  await mkdir(path.join(runtime, 'forge/lib'), { recursive: true });
  await mkdir(path.join(runtime, 'bridge'), { recursive: true });
  await mkdir(path.join(runtime, 'licenses'), { recursive: true });
  await cp(javaHome, path.join(runtime, 'jdk'), { recursive: true });
  await cp(path.join(forge, 'forge-gui/target/classes'), path.join(runtime, 'forge/classes'), { recursive: true });
  await cp(path.join(forge, 'forge-gui/res'), path.join(runtime, 'forge/res'), { recursive: true });
  await cp(path.join(root, 'bridge/forge/ForgeHumanBridge.java'), path.join(runtime, 'bridge/ForgeHumanBridge.java'));
  const dependencies = (await readFile(path.join(forge, 'forge-gui/target/runtime-classpath.txt'), 'utf8')).trim().split(path.delimiter).filter(Boolean);
  const classpath = ['forge/classes'];
  for (const [index, dependency] of dependencies.entries()) {
    const destination = `forge/lib/${String(index).padStart(3, '0')}-${path.basename(dependency)}`;
    await cp(dependency, path.join(runtime, destination), { recursive: true });
    classpath.push(destination);
  }
  await cp(path.join(forge, 'LICENSE'), path.join(runtime, 'licenses/Forge-LICENSE.txt'));
  // Worktree attributes avoid Git materializing unrelated sparse-checkout blobs for attribute lookup.
  await run('git', ['-C', forge, 'archive', '--worktree-attributes', '--format=zip', '--output=' + path.join(runtime, 'licenses/Forge-source.zip'), pin.commit,
    'forge-core', 'forge-game', 'forge-ai', 'forge-gui', 'pom.xml', '.mvn', 'LICENSE'], { windowsHide: true, timeout: 300000 });
  await writeFile(path.join(runtime, 'licenses/Forge-source.json'), JSON.stringify(pin, null, 2));
  const manifest = { version: 1, forgeCommit: pin.commit, javaRelease: pin.javaRelease, classpath, source: 'bridge/ForgeHumanBridge.java', resources: 'forge/res' };
  await writeFile(path.join(runtime, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return runtime;
}
