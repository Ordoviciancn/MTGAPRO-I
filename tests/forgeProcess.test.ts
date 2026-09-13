import test from 'node:test';
import assert from 'node:assert/strict';
import { ForgeProcess } from '../src/server/forgeProcess';
test('bridge waits for readiness and preserves split framed messages', { timeout: 5000 }, async t => {
  const seen: string[] = [];
  let acknowledge!: () => void;
  const acknowledged = new Promise<void>(resolve => { acknowledge = resolve; });
  const bridge = new ForgeProcess({executable:process.execPath,args:['-e', String.raw`process.stdout.write('log\nFORGE_BR');setTimeout(()=>{process.stdout.write('IDGE {"type":"ready"}\n');},20);process.stdin.on('data',()=>process.stdout.write('FORGE_BRIDGE {"type":"ack"}\n'));`],cwd:process.cwd()}, message=>{ seen.push(message.type); if(message.type === 'ack') acknowledge(); },()=>{});
  t.after(()=>bridge.stop());
  assert.throws(()=>bridge.send({type:'init'}),/not ready/);
  await bridge.ready;
  bridge.send({type:'init'});
  await acknowledged;
  assert.deepEqual(seen,['ready','ack']);
});
test('bridge rejects malformed engine output and fails once',async()=>{
  const failures: Error[]=[];
  const bridge=new ForgeProcess({executable:process.execPath,args:['-e',String.raw`process.stdout.write('FORGE_BRIDGE nope\n');setInterval(()=>{},1000);`],cwd:process.cwd()},()=>{},error=>failures.push(error));
  await assert.rejects(bridge.ready,/invalid protocol/); assert.equal(failures.length,1); assert.throws(()=>bridge.send({type:'init'}));
});
test('bridge startup has a bounded timeout',async()=>{
  const bridge=new ForgeProcess({executable:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:process.cwd(),startupTimeoutMs:100},()=>{},()=>{});
  await assert.rejects(bridge.ready,/timed out/);
});
