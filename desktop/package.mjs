import { build } from 'esbuild';
import { packager } from '@electron/packager';
import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {buildBundledRuntime} from './bundle-runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.desktop-stage');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await mkdir(path.join(stage, 'src/server'), { recursive: true });
const serverBuild = await build({ entryPoints: [path.join(root, 'src/server/index.ts')], outfile: path.join(stage, 'src/server/index.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' }, external: ['bufferutil', 'utf-8-validate'] });
const stagedDist = path.resolve(stage, 'dist');
if (path.dirname(stagedDist) !== stage || path.dirname(stage) !== root) throw new Error('Invalid staging path.');
await rm(stagedDist, { recursive: true, force: true });
await cp(path.join(root, 'dist'), stagedDist, { recursive: true });
await cp(path.join(root, 'desktop/main.cjs'), path.join(stage, 'main.cjs'));
await cp(path.join(root, 'desktop/preload.cjs'), path.join(stage, 'preload.cjs'));
await cp(path.join(root, 'desktop/quick-tunnel.cjs'), path.join(stage, 'quick-tunnel.cjs'));
if(process.argv.includes('--with-runtime')){
  if(!process.env.JAVA_HOME)throw new Error('Set JAVA_HOME for the bundled runtime build.');
  await buildBundledRuntime(root,stage,process.env.JAVA_HOME);
  await cp(path.join(root,'.local-tools/cloudflared'),path.join(stage,'cloudflared'),{recursive:true});
}else{
  const cached=await readFile(path.join(stage,'runtime/manifest.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(cached){
    const pin=JSON.parse(await readFile(path.join(root,'config/forge-source.json'),'utf8'));
    if(cached.forgeCommit!==pin.commit)throw new Error('Bundled Forge version changed; run desktop:bundle.');
    await cp(path.join(root,'bridge/forge/ForgeHumanBridge.java'),path.join(stage,'runtime/bridge/ForgeHumanBridge.java'));
  }
}
await cp(path.join(root, 'desktop/server-entry.mjs'), path.join(stage, 'server-entry.mjs'));
await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: manifest.name, productName: manifest.productName, author: manifest.author, description: manifest.description, version: manifest.version, main: 'main.cjs' }));
const packageDirectories = new Set([path.join(root, 'node_modules/react'), path.join(root, 'node_modules/react-dom')]);
const reactRequire = createRequire(await realpath(path.join(root, 'node_modules/react-dom/package.json')));
packageDirectories.add(path.dirname(reactRequire.resolve('scheduler/package.json')));
for (const input of Object.keys(serverBuild.metafile.inputs)) {
  const match = input.replaceAll('\\', '/').match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (match) packageDirectories.add(path.resolve(root, match[1]));
}
const notices = [];
for (const directory of packageDirectories) {
  for (const entry of await readdir(directory)) {
    if (/^(licen[sc]e|notice)(\.|$)/i.test(entry)) notices.push(`${directory.slice(directory.lastIndexOf('node_modules') + 13)} / ${entry}\n${await readFile(path.join(directory, entry), 'utf8')}`);
  }
}
await writeFile(path.join(stage, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n-----\n\n'));
if (!process.argv.includes('--stage-only')) {
  const electronVersion = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
  const cache = path.join(process.env.LOCALAPPDATA || '', 'electron/Cache');
  let electronZipDir;
  try {
    for (const entry of await readdir(cache, { withFileTypes: true })) {
      if (entry.isDirectory() && (await readdir(path.join(cache, entry.name))).includes(`electron-v${electronVersion}-win32-x64.zip`)) { electronZipDir = path.join(cache, entry.name); break; }
    }
  } catch {}
  const outputs = await packager({ dir: stage, out: path.join(root, 'release'), name: 'MTG Simulator', executableName: 'MTG Simulator', platform: 'win32', arch: 'x64', overwrite: true, asar: false, prune: false,
    electronVersion, electronZipDir });
  console.log(outputs.join('\n'));
}
