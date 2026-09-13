import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareForgeLaunch } from '../src/server/forgeRuntime';
import { ForgeProcess } from '../src/server/forgeProcess';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.JAVA_HOME) throw new Error('JAVA_HOME must point to JDK 17.');
const runtime=await prepareForgeLaunch(root,process.env.JAVA_HOME);
const views=new Set<number>();
let finish!:()=>void, fail!:(error:Error)=>void;
const completed=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject;});
completed.catch(()=>undefined);
let inputReceived=false;
const spell=process.argv.includes('--spell');
const opening=process.argv.includes('--opening') || spell;
if(spell) runtime.launch.env={...runtime.launch.env,FORGE_TEST_SEED:'42'};
const answered=new Set<string>();
const snapshots=new Map<number,any>();
let landPlayed=false;
let spellResolved=false;
let spellSelected=false;
const timer=setTimeout(()=>fail(new Error('Human Match did not reach a choice within 120 seconds.')),120000);
const bridge=new ForgeProcess(runtime.launch,message=>{
  if(process.argv.includes('--trace') && message.type==='prompt') console.log(JSON.stringify(message));
  if(message.type==='error') fail(new Error(String(message.message)));
  if(message.type==='state' && (message.seat===0 || message.seat===1)) {
    views.add(message.seat); snapshots.set(message.seat,message);
    if(opening && Array.isArray(message.players) && message.players.some((p:any)=>p.battlefield?.length>0)) {landPlayed=true;if(!spell)finish();}
    if(spell && Array.isArray(message.players) && message.players.some((p:any)=>p.life===17) && message.players.some((p:any)=>p.graveyard?.some((c:any)=>c.name==='Lightning Bolt') && p.battlefield?.some((c:any)=>c.name==='Mountain' && c.tapped)) && Array.isArray(message.stack) && message.stack.length===0) {spellResolved=true;finish();}
  }
  if(message.type==='prompt' && (message.kind==='input' || message.kind==='choice')) inputReceived=true;
  if(!opening && inputReceived && views.size===2) finish();
  if(opening && message.type==='prompt' && typeof message.requestId==='string' && !answered.has(message.requestId)) {
    if(message.okEnabled===true && ['InputConfirm','InputConfirmMulligan'].includes(String(message.inputType)) && /^(Play|Keep|Keep Hand)$/i.test(String(message.okLabel))) {
      answered.add(message.requestId); bridge.send({type:'ok',seat:message.seat,requestId:message.requestId});
    } else if(message.kind==='choice' && Array.isArray(message.options) && message.options.length===1 && (message.options[0].label==='Play land' || (spell && String(message.options[0].label).includes('Lightning Bolt')))) {
      answered.add(message.requestId);bridge.send({type:'choice',seat:message.seat,requestId:message.requestId,value:0});
    } else if(spell && message.inputType==='InputSelectTargets') {
      const opponent=snapshots.get(Number(message.seat))?.players[1-Number(message.seat)];
      if(opponent) {answered.add(message.requestId);bridge.send({type:'selectPlayer',seat:message.seat,requestId:message.requestId,playerId:opponent.id});}
    } else if(spell && String(message.inputType).startsWith('InputPayMana') && message.okEnabled===true && message.okLabel==='Auto') {
      answered.add(message.requestId);bridge.send({type:'ok',seat:message.seat,requestId:message.requestId});
    } else if(message.inputType==='InputPassPriority') {
      const state=snapshots.get(Number(message.seat));
      const player=state?.players[Number(message.seat)];
      const card=player?.hand.find((c:any)=>c.name===(landPlayed?'Lightning Bolt':'Mountain'));
      if(player?.id===state?.activePlayerId && card && !spellSelected) {
        if(landPlayed)spellSelected=true;
        answered.add(message.requestId);bridge.send({type:'selectCard',seat:message.seat,requestId:message.requestId,cardId:card.id});
      } else if(spell && message.okEnabled===true) {
        answered.add(message.requestId);bridge.send({type:'ok',seat:message.seat,requestId:message.requestId});
      }
    }
  }
},fail);
try {
  await bridge.ready;
  bridge.send({type:'init',players:spell?['Human A','Human B'].map(name=>({name,deck:[{name:'Mountain',count:30},{name:'Lightning Bolt',count:30}]})):[{name:'Human A',deck:[{name:'Mountain',count:60}]},{name:'Human B',deck:[{name:'Mountain',count:60}]}]});
  await completed;
  assert.equal(views.size,2);
  if(opening) assert.equal(landPlayed,true);
  if(spell) assert.equal(spellResolved,true);
  console.log(JSON.stringify({engine:'forge',humanInputReached:true,seatViews:2,landPlayed,spellResolved,fullGameVerified:false}));
} finally {
  clearTimeout(timer);
  await bridge.stop();
  await runtime.cleanup();
}
