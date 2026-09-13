import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import type {ArenaCredential,ArenaRoomView} from '../src/shared/arenaProtocol';
const origin=new URL(process.env.FORGE_PUBLIC_URL||'http://127.0.0.1:8797');
assert.ok(['http:','https:'].includes(origin.protocol));
const health=await fetch(new URL('/health',origin),{signal:AbortSignal.timeout(30000)});
assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
const endpoint=new URL('/forge',origin);endpoint.protocol=origin.protocol==='https:'?'wss:':'ws:';
class Client {
  ws=new WebSocket(endpoint,{handshakeTimeout:30000});view?:ArenaRoomView;credential?:ArenaCredential;error?:Error;receipts=new Map<string,string>();
  constructor(){this.ws.on('error',error=>this.error=error);this.ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.type==='view')this.view=m.room;if(m.type==='credential')this.credential=m.credential;if(m.type==='error')this.error=new Error(m.message);if(m.type==='receipt')this.receipts.set(m.receipt.commandId,m.receipt.status);});}
  send(value:unknown){this.ws.send(JSON.stringify(value));}
  async command(operation:string,parameters:Record<string,unknown>){const v=this.view!,id=crypto.randomUUID();this.send({type:'command',command:{protocolVersion:1,matchId:v.matchId,playerId:v.playerId,commandId:id,expectedRevision:v.revision,operation,parameters}});await wait(()=>this.receipts.has(id));}
}
const clients=[new Client(),new Client()];
async function wait(condition:()=>unknown,timeout=120000){const start=Date.now();while(!condition()){for(const c of clients){if(c.error)throw c.error;if(c.view?.status==='failed')throw new Error(c.view.error);}if(Date.now()-start>timeout)throw new Error('Public match timed out');await new Promise(resolve=>setTimeout(resolve,40));}}
try{
  await Promise.all(clients.map(c=>once(c.ws,'open')));
  clients[0].send({type:'create',name:'公网验证 A',deckText:'60 Mountain',bestOf:1});await wait(()=>clients[0].credential);
  clients[1].send({type:'join',name:'公网验证 B',deckText:'60 Mountain',code:clients[0].credential!.code});
  await wait(()=>clients.some(c=>c.view?.prompt));
  let landPlayed=false;
  for(let step=0;step<40&&!landPlayed;step++){
    await wait(()=>clients.some(c=>c.view?.prompt));
    landPlayed=clients.some(c=>c.view?.snapshot?.players.some(p=>p.battlefield.some(card=>card.name==='Mountain')));
    if(landPlayed)break;
    const client=clients.find(c=>c.view?.prompt)!,v=client.view!,p=v.prompt!;
    const own=v.snapshot?.players.find(player=>player.id===v.playerId);
    const land=own?.hand.find(card=>card.actionable&&card.name==='Mountain');
    if(p.kind==='choice')await client.command('choice',{requestId:p.requestId,value:p.options![0].value});
    else if(p.kind==='input'&&land)await client.command('selectCard',{requestId:p.requestId,cardId:land.id});
    else if(p.kind==='input'&&p.okEnabled)await client.command('ok',{requestId:p.requestId});
    else throw new Error(`Unhandled opening prompt: ${p.kind}`);
  }
  assert.ok(landPlayed,'Forge must accept and resolve a land play');
  for(const client of clients){const v=client.view!;const opponent=v.snapshot!.players.find(p=>p.id!==v.playerId)!;assert.ok(opponent.hand.every(card=>card.hidden||!card.name),'Opponent hand must remain private');}
  console.log(JSON.stringify({origin:origin.origin,https:origin.protocol==='https:',webSocketClients:2,forgeLandPlayed:landPlayed,hiddenHands:true,separatePhysicalMachines:false}));
}finally{for(const client of clients)client.ws.close();}
