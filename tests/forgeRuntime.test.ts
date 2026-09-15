import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { bundledPath, prepareForgeLaunch } from '../src/server/forgeRuntime';

test('bundled paths reject absolute paths and directory escapes', () => {
  const root = path.join(os.tmpdir(), 'forge-runtime');
  assert.equal(bundledPath(root, 'forge/classes'), path.join(root, 'forge/classes'));
  for (const entry of ['', '..', '../outside', root, null]) assert.throws(() => bundledPath(root, entry));
});

test('bundled launch uses relocatable dependencies and a separate writable session without Git', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'forge-bundle-test-'));
  const bundle = path.join(temporary, 'MTG Simulator 中文目录', 'runtime');
  const sessions = path.join(temporary, '玩家 user data');
  const previous = [process.env.FORGE_BUNDLED_RUNTIME, process.env.FORGE_SESSION_ROOT];
  let runtime: Awaited<ReturnType<typeof prepareForgeLaunch>> | undefined;
  try {
    await Promise.all(['jdk/bin', 'forge/classes', 'forge/res', 'bridge'].map(dir => mkdir(path.join(bundle, dir), { recursive: true })));
    await writeFile(path.join(bundle, 'jdk/bin/java.exe'), 'fixture');
    await writeFile(path.join(bundle, 'bridge/ForgeHumanBridge.java'), 'fixture');
    await writeFile(path.join(bundle, 'manifest.json'), JSON.stringify({ version: 1, javaRelease: 17, forgeCommit: 'a'.repeat(40), classpath: ['forge/classes'], source: 'bridge/ForgeHumanBridge.java', resources: 'forge/res' }));
    process.env.FORGE_BUNDLED_RUNTIME = bundle;
    process.env.FORGE_SESSION_ROOT = sessions;
    runtime = await prepareForgeLaunch(path.join(temporary, 'no-workspace'), 'ignored-external-java');
    assert.equal(runtime.launch.executable, path.join(bundle, 'jdk/bin/java.exe'));
    assert.equal(path.dirname(runtime.launch.cwd!), sessions);
    assert.equal(runtime.launch.env?.APPDATA, runtime.launch.cwd);
    assert.ok(runtime.launch.args.includes(path.join(bundle, 'forge/classes')));
    assert.ok(runtime.launch.args.includes(path.join(bundle, 'bridge/ForgeHumanBridge.java')));
    assert.ok(runtime.launch.args.includes(runtime.launch.cwd!));
    assert.ok(runtime.launch.args.every(arg => !arg.startsWith('@')));
    await runtime.cleanup();
    await assert.rejects(access(runtime.launch.cwd!));
    runtime = undefined;
    process.env.FORGE_SESSION_ROOT = 'relative';
    await assert.rejects(prepareForgeLaunch(temporary, ''), /absolute writable/);
  } finally {
    await runtime?.cleanup();
    for (const [index, key] of ['FORGE_BUNDLED_RUNTIME', 'FORGE_SESSION_ROOT'].entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
    await rm(temporary, { recursive: true, force: true });
  }
});
