import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createForgeRooms } from '../src/server/forgeRooms';
import type { ArenaClientMessage, ArenaServerMessage } from '../src/shared/arenaProtocol';

test('Forge lobby directory refreshes public room metadata without exposing decks or credentials', {timeout:10000},async t=>{
  const rooms=createForgeRooms(process.cwd());
  const server=new WebSocketServer({host:'127.0.0.1',port:0});
  const clients:WebSocket[]=[];
  server.on('connection',rooms);
  t.after(async()=>{
    for(const client of clients)client.terminate();
    for(const client of server.clients)client.terminate();
    await rooms.close();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  });
  await once(server,'listening');
  const address=server.address();assert.ok(typeof address==='object'&&address);
  async function connect(){
    const ws=new WebSocket(`ws://127.0.0.1:${(address as {port:number}).port}`);clients.push(ws);
    const queue:ArenaServerMessage[]=[];
    const waiting:((message:ArenaServerMessage)=>void)[]=[];
    ws.on('message',raw=>{const message=JSON.parse(raw.toString());const resolve=waiting.shift();if(resolve)resolve(message);else queue.push(message);});
    await once(ws,'open');
    return {send:(message:ArenaClientMessage)=>ws.send(JSON.stringify(message)),next:()=>queue.length?Promise.resolve(queue.shift()!):new Promise<ArenaServerMessage>(resolve=>waiting.push(resolve))};
  }
  const lobby=await connect();
  lobby.send({type:'listRooms'});assert.deepEqual(await lobby.next(),{type:'rooms',rooms:[]});
  const host=await connect();
  host.send({type:'create',name:'Doctor',deckText:'60 Island\nSideboard\n1 Counterspell',bestOf:3});
  const credential=await host.next();assert.equal(credential.type,'credential');if(credential.type!=='credential')throw new Error('Missing credential');
  assert.equal((await host.next()).type,'view');
  lobby.send({type:'listRooms'});
  const directory=await lobby.next();
  assert.deepEqual(directory,{type:'rooms',rooms:[{code:credential.credential.code,hostName:'Doctor',seats:1,bestOf:3,status:'waiting'}]});
  const serialized=JSON.stringify(directory);
  for(const privateValue of ['Island','Counterspell',credential.credential.token,credential.credential.playerId])assert.ok(!serialized.includes(privateValue));
  for(const request of [{type:'listRooms'}, {type:'create',name:'Other',deckText:'60 Mountain'}, {type:'join',name:'Other',deckText:'60 Mountain',code:credential.credential.code}] as ArenaClientMessage[]){
    host.send(request);assert.equal((await host.next()).type,'error');
  }
  for(let i=1;i<8;i++){
    const player=await connect();player.send({type:'create',name:`Player ${i}`,deckText:'60 Mountain'});
    assert.equal((await player.next()).type,'credential');assert.equal((await player.next()).type,'view');
  }
  lobby.send({type:'listRooms'});const refreshed=await lobby.next();assert.equal(refreshed.type,'rooms');
  if(refreshed.type==='rooms'){assert.equal(refreshed.rooms.length,8);assert.equal(refreshed.rooms[1].bestOf,1);}
  lobby.send({type:'create',name:'Over capacity',deckText:'60 Mountain'});assert.equal((await lobby.next()).type,'error');
  lobby.send({type:'join',name:'Unknown',deckText:'60 Mountain',code:'MISSING'});assert.equal((await lobby.next()).type,'error');
  host.send({type:'leave'});assert.equal((await host.next()).type,'roomClosed');
  lobby.send({type:'listRooms'});const afterLeave=await lobby.next();
  assert.equal(afterLeave.type,'rooms');
  if(afterLeave.type==='rooms'){
    assert.equal(afterLeave.rooms.length,7);
    assert.ok(!afterLeave.rooms.some(room=>room.code===credential.credential.code));
  }
  lobby.send({type:'resume',credential:credential.credential});assert.equal((await lobby.next()).type,'error');
  host.send({type:'create',name:'New room',deckText:'60 Island'});
  assert.equal((await host.next()).type,'credential');assert.equal((await host.next()).type,'view');
  lobby.send({type:'listRooms'});const replaced=await lobby.next();
  if(replaced.type!=='rooms')throw new Error('Missing directory');
  assert.equal(replaced.rooms.length,8);
});
