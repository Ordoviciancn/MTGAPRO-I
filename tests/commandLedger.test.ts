import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandLedger } from '../src/server/commandLedger';
import type { Command,CommandReceipt } from '../src/shared/matchProtocol';
const command:Command={protocolVersion:1,matchId:'m',playerId:'a',commandId:'c1',expectedRevision:0,operation:'pass',parameters:{}};

test('concurrent duplicate commands execute once and return the original receipt',async()=>{
  const ledger=new CommandLedger('m'); let revision=0,calls=0;
  const execute=async(c:Command):Promise<CommandReceipt>=>{calls++;return {commandId:c.commandId,revision:++revision,status:'accepted'};};
  const results=await Promise.all([ledger.submit(command,'a',()=>revision,execute),ledger.submit(command,'a',()=>revision,execute)]);
  assert.equal(calls,1);assert.deepEqual(results[0],results[1]);
  results[0].revision=999;
  assert.equal((await ledger.submit(command,'a',()=>revision,execute)).revision,1);
});
test('wrong identity, conflicting reuse, and stale revisions cannot execute',async()=>{
  const ledger=new CommandLedger('m');let revision=0,calls=0;
  const execute=async(c:Command):Promise<CommandReceipt>=>{calls++;return {commandId:c.commandId,revision:++revision,status:'accepted'};};
  assert.equal((await ledger.submit(command,'b',()=>revision,execute)).code,'identity');
  await ledger.submit(command,'a',()=>revision,execute);
  assert.equal((await ledger.submit({...command,operation:'cast'},'a',()=>revision,execute)).code,'conflict');
  assert.equal((await ledger.submit({...command,commandId:'c2'},'a',()=>revision,execute)).status,'resync');
  assert.equal(calls,1);
});
test('uncertain engine failure is retained so retries cannot repeat side effects',async()=>{
  const ledger=new CommandLedger('m');let calls=0;
  const execute=async():Promise<CommandReceipt>=>{calls++;throw new Error('lost acknowledgement');};
  const first=await ledger.submit(command,'a',()=>0,execute);
  assert.equal(first.status,'resync');
  assert.deepEqual(await ledger.submit(command,'a',()=>0,execute),first);assert.equal(calls,1);
  assert.equal((await ledger.submit({...command,commandId:'c2'},'a',()=>0,execute)).status,'resync');
  assert.equal(calls,1);
});
