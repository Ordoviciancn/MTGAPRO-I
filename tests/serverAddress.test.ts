import test from 'node:test';
import assert from 'node:assert/strict';
import {serverAddress,seatStorageKey} from '../src/client/serverAddress';
test('server addresses normalize consistently and scope seat credentials by server',()=>{
  assert.equal(serverAddress(' localhost:8789 '),'ws://localhost:8789/forge');
  assert.equal(serverAddress('https://cards.example/'),'wss://cards.example/forge');
  assert.equal(serverAddress('wss://cards.example/forge'),serverAddress('https://cards.example'));
  assert.notEqual(seatStorageKey(serverAddress('host:8787')),seatStorageKey(serverAddress('host:8789')));
});
test('server connection rejects embedded credentials, unsupported paths and mixed content',()=>{
  for(const input of ['','file:///tmp','http://user:pass@host','https://host/other','https://host/?token=private','https://host/#hash'])assert.throws(()=>serverAddress(input));
  assert.throws(()=>serverAddress('http://host','https:'));
});
