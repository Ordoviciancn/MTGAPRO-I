import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {createForgeRooms} from '../src/server/forgeRooms';
import type {ArenaRoomView,ArenaCredential, ArenaServerMessage} from '../src/shared/arenaProtocol';
process.env.FORGE_TEST_SEED='42';
const server=createServer(),wss=new WebSocketServer({server}),rooms=createForgeRooms(process.cwd());
wss.on('connection',rooms);server.listen(0,'127.0.0.1');await once(server,'listening');
const clients=[0,1].map(()=>({ws:new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/forge`),view:undefined as ArenaRoomView|undefined,credential:undefined as ArenaCredential|undefined,receipts:new Map<string,any>()}));
for(const client of clients)client.ws.on('message',raw=>{const m=JSON.parse(raw.toString()) as ArenaServerMessage;if(m.type==='view')client.view=m.room;if(m.type==='credential')client.credential=m.credential;if(m.type==='receipt')client.receipts.set(m.receipt.commandId,m.receipt);});
async function wait(condition:()=>unknown,timeout=20000){const start=Date.now();while(!condition()){assert.ok(!clients.some(c=>c.view?.status==='failed'),'Engine failed');if(Date.now()-start>timeout)throw new Error('BO3 scenario timed out');await new Promise(r=>setTimeout(r,20));}}
async function command(seat:number,operation:string,parameters:Record<string,unknown>={}){const c=clients[seat],v=c.view!,id=crypto.randomUUID();c.ws.send(JSON.stringify({type:'command',command:{protocolVersion:1,matchId:v.matchId,playerId:v.playerId,commandId:id,expectedRevision:v.revision,operation,parameters}}));await wait(()=>c.receipts.has(id));return c.receipts.get(id);}
const answered=new Set<string>(),sideboards=new Set<string>(),conceded=new Set<number>(),choosers=new Map<number,number>();
let swappedDraw=false;
try{
  await Promise.all(clients.map(c=>once(c.ws,'open')));
  clients[0].ws.send(JSON.stringify({type:'create',name:'BO3 A',bestOf:3,deckText:'60 Mountain\nSideboard\n15 Lightning Bolt'}));await wait(()=>clients[0].credential);
  clients[1].ws.send(JSON.stringify({type:'join',code:clients[0].credential!.code,name:'BO3 B',deckText:'60 Mountain\nSideboard\n15 Island'}));
  await wait(()=>clients.some(c=>c.view?.prompt),120000);
  for(let step=0;step<60&&!clients[0].view?.snapshot?.matchOver;step++){
    await wait(()=>clients.some(c=>c.view?.snapshot?.matchOver||c.view?.prompt&&!answered.has(c.view.prompt.requestId)));
    if(clients[0].view?.snapshot?.matchOver)break;
    const seat=clients.findIndex(c=>c.view?.prompt&&!answered.has(c.view.prompt.requestId));
    const v=clients[seat].view!,p=v.prompt!,state=v.snapshot!,game=state.gameNumber!;
    assert.equal(state.bestOf,3);assert.equal(state.players[1-seat].hand.length,0);
    let op='ok',args:Record<string,unknown>={requestId:p.requestId};
    if(p.kind==='sideboard'){
      sideboards.add(`${game}:${seat}`);assert.equal(p.initialMainSize,60);assert.equal(p.options?.length,75);
      assert.ok(!clients[1-seat].view?.prompt?.options?.some(o=>o.label.includes(seat===0?'Lightning Bolt':'Island')),'Private sideboard leaked');
      const invalid=await command(seat,'choice',{requestId:p.requestId,value:[0]});assert.equal(invalid.status,'rejected');
      op='choice';args.value=p.options!.slice(15).map(o=>o.value);
    }else if(p.inputType==='InputConfirm'){
      // 后续局（MTG 规则 103.2）由上一局败者在确认窗选择先手/后手；第一局由掷币直接决定，无窗口。
      assert.equal(seat,game===3?1:0,`Play/draw window for game ${game} must go to the previous game's loser`);
      choosers.set(game,seat);
    }else if(p.inputType==='InputPassPriority'&&!conceded.has(game)){
      if(game===2)swappedDraw=clients.some(c=>c.view?.snapshot?.players[c.view.seat].hand.some(card=>card.name!=='Mountain'));
      const loser=game===2?1:0;
      const r=await command(loser,'concede');if(r.status==='resync'){step--;continue;}assert.equal(r.status,'accepted');conceded.add(game);await wait(()=>clients.every(c=>c.view?.snapshot?.matchOver||(c.view?.snapshot?.gameNumber??0)>game));continue;
    }
    const r=await command(seat,op,args);if(r.status==='resync'){step--;continue;}assert.equal(r.status,'accepted',JSON.stringify({game,seat,input:p.inputType,kind:p.kind,op,args,receipt:r}));answered.add(p.requestId);
  }
  await wait(()=>clients[0].view?.snapshot?.matchOver);
  assert.deepEqual(clients[0].view!.snapshot!.scores,[1,2]);assert.equal(clients[0].view!.snapshot!.gameNumber,3);assert.equal(sideboards.size,4);assert.deepEqual([...choosers.entries()].sort((a,b)=>a[0]-b[0]),[[2,0],[3,1]],'Games 2 and 3 must be started by the previous game\'s loser');assert.ok(swappedDraw,'Sideboard cards must be drawn from the actual next game deck');
  for(const client of clients)assert.deepEqual(client.view!.snapshot!.winnerPlayerIds,[client.view!.snapshot!.players[1].id],'Final winner comes from Forge outcome');
  console.log(JSON.stringify({engine:'forge',bo3:true,score:[1,2],sideboardWindows:4,actualSideboardDraw:true,coinTossDecidesGame1:true,loserChoosesPlayDraw:true,confirmedWinner:true,fullCardPoolVerified:false}));
}finally{for(const c of clients)c.ws.close();await rooms.close();wss.close();server.close();}
