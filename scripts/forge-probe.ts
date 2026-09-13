import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);
const root = process.cwd();
const javaHome = process.env.JAVA_HOME;
if (!javaHome) throw new Error('Set JAVA_HOME to your JDK 17 directory.');
const forge = path.join(root, '.local-tools/forge');
const pin = JSON.parse(await readFile(path.join(root, 'config/forge-source.json'), 'utf8'));
const revision = await run('git', ['-C', forge, 'rev-parse', 'HEAD']);
if (revision.stdout.trim() !== pin.commit) throw new Error('Forge source revision does not match the pinned version.');
const dependencies = (await readFile(path.join(forge, 'forge-ai/target/runtime-classpath.txt'), 'utf8')).trim();
const classpath = [path.join(forge, 'forge-ai/target/classes'), dependencies].join(path.delimiter);
const temporary = await mkdtemp(path.join(root, '.local-tools/probe-'));
const quote = (value: string) => '"' + value.replaceAll('\\', '/').replaceAll('"', '\\"') + '"';
try {
  const argsFile = path.join(temporary, 'java.args');
  await writeFile(argsFile, ['--class-path', quote(classpath), quote(path.join(root, 'bridge/forge/ForgeProbe.java')), quote(path.join(forge, 'forge-gui/res'))].join('\n'));
  const output = await run(path.join(javaHome, 'bin/java.exe'), ['@' + argsFile], { timeout: 60000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const lines = output.stdout.split(/\r?\n/).filter(line => line.startsWith('FORGE_PROBE '));
  if (lines.length !== 1) throw new Error('Forge did not return exactly one probe result.');
  const result = JSON.parse(lines[0].slice('FORGE_PROBE '.length));
  if (result.engine !== 'forge' || result.players !== 2 || result.library !== 2 || result.hand !== 1 || result.matchStarted !== false) throw new Error('Unexpected Forge probe result.');
  console.log(JSON.stringify({ ...result, revision: pin.commit }));
} finally {
  await rm(temporary, { recursive: true });
}
