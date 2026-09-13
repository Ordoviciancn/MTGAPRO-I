import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionRecovery} from '../src/client/connectionRecovery';

test('quiet games probe before reconnecting, without sending rule actions',()=>{
  assert.equal(connectionRecovery(9999,0),'wait');
  assert.equal(connectionRecovery(10000,0),'probe');
  assert.equal(connectionRecovery(30000,0),'reconnect');
  assert.equal(connectionRecovery(30000,29000),'wait');
});
test('a lost receipt retries even while other game messages keep arriving',()=>{
  assert.equal(connectionRecovery(19999,19000,0),'wait');
  assert.equal(connectionRecovery(20000,19000,0),'retry');
  assert.equal(connectionRecovery(30000,0,0),'reconnect');
  assert.equal(connectionRecovery(20001,20000,20000),'wait');
});
