import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {createForgeRooms} from '../src/server/forgeRooms';
import type {ArenaCredential,ArenaRoomView,ArenaServerMessage} from '../src/shared/arenaProtocol';
import type {Command,CommandReceipt} from '../src/shared/matchProtocol';

process.env.FORGE_TEST_SEED='42';
let viewMessages=0;
const commandTimes:number[]=[];
const complete=process.argv.includes('--complete');
const combat=process.argv.includes('--combat');
const numeric=process.argv.includes('--x');
const scry=process.argv.includes('--scry');
const manland=process.argv.includes('--manland');
const cardTarget=process.argv.includes('--card-target');
const server=createServer(),wss=new WebSocketServer({server}),rooms=createForgeRooms(process.cwd());
wss.on('connection',rooms);server.listen(0,'127.0.0.1');await once(server,'listening');
const port=(server.address() as {port:number}).port;
class Client {
  ws=new WebSocket(`ws://127.0.0.1:${port}/forge`);
  view?:ArenaRoomView;credential?:ArenaCredential;errors:string[]=[];events:string[]=[];
  receipts=new Map<string,CommandReceipt>();
  constructor(){this.ws.on('message',raw=>{const message=JSON.parse(raw.toString()) as ArenaServerMessage;
    if(message.type==='view'){viewMessages++;this.view=message.room;if(message.room.status==='failed')console.error(message.room.error);}
    if(message.type==='credential')this.credential=message.credential;
    if(message.type==='error')this.errors.push(message.message);
    if(message.type==='event')this.events.push(message.event.kind);
    if(message.type==='receipt')this.receipts.set(message.receipt.commandId,message.receipt);
  });}
  send(message:unknown){this.ws.send(JSON.stringify(message));}
  async command(operation:string,parameters:Record<string,unknown>,identity?:string){
    const v=this.view!;const command:Command={protocolVersion:1,matchId:v.matchId,playerId:identity??v.playerId,commandId:crypto.randomUUID(),expectedRevision:v.revision,operation,parameters};
    const started=performance.now();this.send({type:'command',command});await wait(()=>this.receipts.has(command.commandId));commandTimes.push(performance.now()-started);
    return {command,receipt:this.receipts.get(command.commandId)!};
  }
}
async function wait(condition:()=>unknown,timeout=20000){const start=Date.now();while(!condition()){const failed=clients.find(c=>c.view?.status==='failed');if(failed)throw new Error(failed.view!.error);if(Date.now()-start>timeout)throw new Error('Network scenario timed out.');await new Promise(resolve=>setTimeout(resolve,20));}}
const clients=[new Client(),new Client(),new Client()];
try {
  await Promise.all(clients.map(c=>once(c.ws,'open')));
  const spellName=cardTarget?'Shock':manland?"Mishra's Factory":scry?'Preordain':numeric?'Blaze':combat?'Grizzly Bears':'Lightning Bolt';
  const landName=scry?'Island':combat?'Forest':'Mountain';
  const deckText=cardTarget?`24 Mountain\n18 Goblin Arsonist\n18 Shock`:`30 ${landName}\n30 ${spellName}`;
  clients[0].send({type:'create',name:'Human A',deckText});await wait(()=>clients[0].credential);
  const code=clients[0].credential!.code;
  clients[2].send({type:'resume',credential:{...clients[0].credential,token:'wrong'}});await wait(()=>clients[2].errors.length);
  assert.equal(clients[2].view,undefined);
  clients[1].send({type:'join',code,name:'Human B',deckText});
  await wait(()=>clients.some(c=>c.view?.prompt),120000);
  assert.ok(clients.slice(0,2).every(c=>c.view?.snapshot?.coinChoicePending),'Coin stays visible while play/draw is pending');
  let resolved=false,verifiedDuplicate=false,blocked=false,summoningChecked=false,numericChosen=false,targetInputSeen=false,abilityPromptSeen=false;
  let ordered:{seat:number;name:string;handIds:string[]}|undefined;
  const done=(c:Client)=>cardTarget?targetInputSeen&&c.view?.snapshot?.players.some(p=>p.graveyard.some(card=>card.name==='Goblin Arsonist'))&&c.view.snapshot.players.some(p=>p.graveyard.some(card=>card.name==='Shock')):manland?c.view?.snapshot?.players.some(p=>p.battlefield.some(card=>card.name===spellName&&card.kind==='creature')):scry?ordered&&c.view?.seat===ordered.seat&&c.view.snapshot?.players[ordered.seat].hand.some(card=>!ordered!.handIds.includes(card.id))&&c.view.snapshot.players[ordered.seat].graveyard.some(card=>card.name===spellName):combat?blocked&&c.view?.snapshot?.players.some(p=>p.life<20):complete?c.view?.snapshot?.gameOver:c.view?.snapshot?.players.some(p=>p.life===(numeric?19:17));
  for(let step=0;step<(complete||combat?250:50)&&!resolved;step++){
    await wait(()=>clients.slice(0,2).some(c=>c.view?.prompt)||clients.some(done));
    const damaged=clients.find(done);
    if(damaged){resolved=true;break;}
    const client=clients.slice(0,2).find(c=>c.view?.prompt)!;
    const room=client.view!,prompt=room.prompt!,state=room.snapshot!;
    if(prompt.message==='Choose ability')abilityPromptSeen=true;
    if(process.argv.includes('--trace'))console.log(JSON.stringify({step,seat:room.seat,input:prompt.inputType,life:state.players.map(p=>p.life),phase:state.phase,options:prompt.options}));
    assert.equal(state.players.find(p=>p.id!==room.playerId)?.hand.length,0);
    let operation='ok',parameters:Record<string,unknown>={requestId:prompt.requestId};
    if(prompt.inputType==='InputPassPriority'){
      const own=state.players.find(p=>p.id===room.playerId)!;
      const name=own.battlefield.length?'Lightning Bolt':'Mountain';
      const opposingCreature=state.players.find(p=>p.id!==room.playerId)!.battlefield.some(c=>c.kind==='creature');
      const card=cardTarget?(own.hand.find(c=>c.actionable&&c.name===landName)??own.hand.find(c=>c.actionable&&c.name==='Goblin Arsonist'&&!own.battlefield.some(card=>card.kind==='creature'))??(opposingCreature?own.hand.find(c=>c.actionable&&c.name==='Shock'):undefined)):manland?(own.battlefield.length>=2?own.battlefield.find(c=>c.name===spellName):own.hand.find(c=>c.actionable&&c.name===(own.battlefield.some(c=>c.name===landName)?spellName:landName))):complete||combat||numeric||scry?(own.hand.find(c=>c.actionable&&c.name===landName)??own.hand.find(c=>c.actionable&&c.name===spellName&&(!numeric||own.battlefield.filter(c=>c.kind==='land'&&!c.tapped).length>=2))):own.hand.find(c=>c.name===name);
      if(state.activePlayerId===room.playerId&&card){operation='selectCard';parameters.cardId=card.id;}
    }else if(prompt.inputType==='InputAttack'){
      if(!state.combat.length)operation='cancel';
      else if(!summoningChecked){const creatures=state.players.find(p=>p.id===room.playerId)!.battlefield.filter(c=>c.kind==='creature');assert.ok(state.combat.length<creatures.length,'Newly cast creature must not attack with older creatures.');summoningChecked=true;}
    }else if(prompt.inputType==='InputBlock'){
      if(state.combat.some(attack=>attack.blockerIds.length))blocked=true;
      if(!blocked){const blocker=state.players.find(p=>p.id===room.playerId)!.battlefield.find(c=>c.kind==='creature'&&!c.tapped);if(blocker){operation='selectCard';parameters.cardId=blocker.id;}}
    }else if(prompt.inputType==='InputSelectTargets'){
      if(cardTarget){
        const target=state.players.find(p=>p.id!==room.playerId)!.battlefield.find(c=>c.kind==='creature');
        assert.ok(target?.actionable,'A legal card target must be projected as actionable');
        assert.ok(state.players.flatMap(p=>p.battlefield).filter(c=>c.actionable).every(c=>c.kind==='creature'),'Only legal creature targets may be actionable');
        targetInputSeen=true;operation='selectCard';parameters.cardId=target.id;
      }else{operation='selectPlayer';parameters.playerId=state.players.find(p=>p.id!==room.playerId)!.id;}
    }else if(prompt.kind==='number'){
      assert.equal(numeric,true);operation='choice';parameters.value=1;
      const other=clients[1-room.seat];
      const wrongSeat=await other.command('choice',{requestId:prompt.requestId,value:1});assert.equal(wrongSeat.receipt.status,'rejected');
      const enabled=await client.command('control',{fullControl:true});assert.equal(enabled.receipt.status,'accepted');assert.equal(client.view?.fullControl,true);assert.equal(other.view?.fullControl,false);assert.equal(client.view?.prompt?.requestId,prompt.requestId);
      const disabled=await client.command('control',{fullControl:false});assert.equal(disabled.receipt.status,'accepted');assert.equal(client.view?.fullControl,false);assert.equal(client.view?.prompt?.requestId,prompt.requestId);
      const bad=await client.command('choice',{requestId:prompt.requestId,value:-1});
      assert.equal(bad.receipt.status,'rejected');assert.equal(client.view?.prompt?.requestId,prompt.requestId);
      numericChosen=true;
    }else if(prompt.kind==='order'){
      assert.equal(scry,true);assert.equal(prompt.options?.length,2);operation='choice';parameters.value=prompt.options!.map(option=>option.value).reverse();
      ordered={seat:room.seat,name:prompt.options![1].label,handIds:state.players[room.seat].hand.map(c=>c.id)};
    }else if(scry&&prompt.kind==='choice'&&prompt.min===0){
      assert.equal(prompt.max,2);operation='choice';parameters.value=[];
    }else if(manland&&prompt.kind==='choice'){
      const option=prompt.options?.find(o=>/becomes.*creature/i.test(o.label));assert.ok(option,JSON.stringify(prompt));operation='choice';parameters.value=option.value;
    }else if(prompt.kind==='choice'){
      assert.equal(prompt.options?.length,1);operation='choice';parameters.value=prompt.options![0].value;
    }else assert.ok(prompt.okEnabled,JSON.stringify(prompt));
    if(!verifiedDuplicate){
      const forged=await client.command(operation,parameters,state.players.find(p=>p.id!==room.playerId)!.id);
      assert.equal(forged.receipt.code,'identity');
    }
    const result=await client.command(operation,parameters);
    if(result.receipt.status==='resync')continue;
    assert.equal(result.receipt.status,'accepted',JSON.stringify({prompt,result}));
    if(!verifiedDuplicate){
      client.receipts.delete(result.command.commandId);client.send({type:'command',command:result.command});await wait(()=>client.receipts.has(result.command.commandId));
      assert.deepEqual(client.receipts.get(result.command.commandId),result.receipt);verifiedDuplicate=true;
    }
  }
  assert.equal(resolved,true);
  const history=clients[0].view!.recentStackEvents??[];
  assert.ok(history.some(event=>event.kind==='cast'&&event.data.name===spellName),'Fast resolution retains the cast record');
  assert.ok(history.some(event=>event.kind==='cast'&&typeof event.data.ability==='boolean'),'Stack events distinguish spells and abilities');
  if(cardTarget){assert.equal(abilityPromptSeen,false,'Target selection must not open Choose ability');console.log(JSON.stringify({engine:'forge',cardTargetResolved:true,abilityPromptSeen:false,fullGameVerified:false}));}
  else if(manland){
    const creature=clients[0].view!.snapshot!.players.flatMap(p=>p.battlefield).find(c=>c.name===spellName&&c.kind==='creature');
    assert.ok(creature);assert.equal(creature.power,2);assert.equal(creature.toughness,2);
    console.log(JSON.stringify({engine:'forge',animatedLandClassifiedAsCreature:true,fullGameVerified:false}));
  }else{
  await wait(()=>clients[0].view?.snapshot?.stack.length===0&&clients[0].view?.snapshot?.players.some(p=>p.graveyard.some(c=>c.name===spellName)));
  if(!scry)assert.ok(clients[0].events.includes('life'));assert.ok(clients[0].events.includes('cast'));assert.ok(clients[0].events.includes('resolve'));
  const credential=clients[0].credential!,before=clients[0].view!.snapshot!;
  assert.equal(before.coinChoicePending,false,'Only the accepted play/draw decision dismisses the coin');
  clients[0].ws.close();await once(clients[0].ws,'close');
  const resumed=new Client();clients.push(resumed);await once(resumed.ws,'open');resumed.send({type:'resume',credential});await wait(()=>resumed.view);
  assert.deepEqual(resumed.view!.snapshot?.players.map(p=>p.life),before.players.map(p=>p.life));
  assert.equal(resumed.view!.playerId,credential.playerId);
  assert.deepEqual(resumed.view!.recentStackEvents,clients[0].view!.recentStackEvents,'Reconnect retains the visible stack history');
  if(combat){assert.equal(blocked,true);assert.equal(summoningChecked,true);assert.ok(clients[0].events.includes('combat'));assert.ok(clients[0].view!.snapshot!.players.every(p=>p.graveyard.some(c=>c.name==='Grizzly Bears')));assert.ok(clients[0].view!.snapshot!.players.some(p=>p.life===18));}
  if(numeric){assert.equal(numericChosen,true);assert.ok(before.players.some(p=>p.battlefield.filter(c=>c.tapped&&c.kind==='land').length===2));}
  if(scry){assert.ok(ordered);assert.equal(clients[ordered.seat].view!.snapshot!.players[ordered.seat].hand.find(c=>!ordered!.handIds.includes(c.id))?.name,ordered.name);}
  console.log(JSON.stringify({engine:'forge',networkSpellResolved:!combat,combatBlockedAndDamaged:combat&&blocked,xValuePaidAndResolved:numeric&&numericChosen,scryOrderedAndDrawn:scry&&!!ordered,seatImpersonationRejected:true,duplicateReceiptStable:true,semanticEvents:true,reconnect:true,completedDamageMatch:complete,fullGameVerified:false}));
  }
}finally{
  if(process.argv.includes('--profile'))console.log(JSON.stringify({viewMessages,commands:commandTimes.length,medianAckMs:[...commandTimes].sort((a,b)=>a-b)[Math.floor(commandTimes.length/2)]}));
  for(const client of clients)client.ws.close();await rooms.close();wss.close();server.close();
}
