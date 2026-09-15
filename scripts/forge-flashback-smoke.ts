import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareForgeLaunch } from '../src/server/forgeRuntime';
import { ForgeProcess } from '../src/server/forgeProcess';

// 验证熔岩镖（Firebolt）返照：正常施放进坟场后，攒足法术力时坟场牌被标记 actionable 并能完成返照施放（进放逐区）。
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.JAVA_HOME) throw new Error('JAVA_HOME must point to JDK 17.');
const runtime=await prepareForgeLaunch(root,process.env.JAVA_HOME);
runtime.launch.env={...runtime.launch.env,FORGE_TEST_SEED:'11'};
let finish!:()=>void, fail!:(e:Error)=>void;
const completed=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject;});
completed.catch(()=>undefined);
const timer=setTimeout(()=>fail(new Error('Flashback smoke timed out after 150 seconds.')),150000);
const answered=new Set<string>();
const snapshots=new Map<number,any>();
const landFlag=new Map<number,boolean>();
let flashbackActionable=false,flashbackCast=false;
const isMain=(phase:any)=>/MAIN/i.test(String(phase));
const bridge=new ForgeProcess(runtime.launch,message=>{
  if(message.type==='error') fail(new Error(String(message.message)));
  if(message.type==='state' && typeof message.seat==='number'){
    snapshots.set(message.seat,message);
    const me=message.players[message.seat];
    if(!(message.activePlayerId===me?.id)||!isMain(message.phase))landFlag.set(message.seat,false);
    // 返照标记：坟场中的 Firebolt 被引擎标记为可操作
    if(me?.graveyard?.some((c:any)=>c.name==='Firebolt'&&c.actionable))flashbackActionable=true;
    // 返照完成：曾被标记 actionable 的 Firebolt 结算后进入放逐区（返照 4 点伤害会继续改变生命值，不能叠加生命值条件）
    if(flashbackActionable&&me?.exile?.some((c:any)=>c.name==='Firebolt')){flashbackCast=true;finish();}
  }
  if(message.type==='prompt' && typeof message.requestId==='string' && !answered.has(message.requestId)){
    const seat=Number(message.seat);
    const state=snapshots.get(seat);
    const me=state?.players[seat];
    const opp=state?.players[1-seat];
    const land=me?.hand?.find((c:any)=>c.name==='Mountain');
    const firebolt=me?.hand?.find((c:any)=>c.name==='Firebolt');
    const graveFirebolt=me?.graveyard?.find((c:any)=>c.name==='Firebolt');
    const landCount=me?.battlefield?.filter((c:any)=>c.kind==='land').length??0;
    if(message.okEnabled===true && ['InputConfirm','InputConfirmMulligan'].includes(String(message.inputType))){
      answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
    } else if(message.kind==='choice' && Array.isArray(message.options) && message.options.length>0 && (String(message.options[0].label)==='Play land'||String(message.options[0].label).includes('Firebolt'))){
      answered.add(message.requestId);bridge.send({type:'choice',seat,requestId:message.requestId,value:0});
    } else if(message.inputType==='InputSelectTargets' && opp){
      answered.add(message.requestId);bridge.send({type:'selectPlayer',seat,requestId:message.requestId,playerId:opp.id});
    } else if(String(message.inputType).startsWith('InputPayMana') && message.okEnabled===true){
      answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
    } else if(message.inputType==='InputPassPriority'){
      console.error(JSON.stringify({pass:{seat,phase:state?.phase,active:state?.activePlayerId===me?.id,landCount,grave:me?.graveyard?.map((c:any)=>c.name+'/'+c.actionable),hand:me?.hand?.map((c:any)=>c.name),exile:me?.exile?.map((c:any)=>c.name)}}));
      const myTurn=state?.activePlayerId===me?.id&&isMain(state?.phase);
      if(myTurn&&land&&landCount<6&&!landFlag.get(seat)){
        landFlag.set(seat,true);answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:land.id});
      } else if(myTurn&&firebolt&&landCount>=1){
        answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:firebolt.id});
      } else if(myTurn&&graveFirebolt&&landCount>=5){
        // 返照：从坟场打出，验证 actionable 标记与点击链路
        answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:graveFirebolt.id});
      } else if(message.okEnabled===true){
        answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
      }
    }
  }
},fail);
try{
  await bridge.ready;
  bridge.send({type:'init',players:['Human A','Human B'].map(name=>({name,deck:[{name:'Firebolt',count:30},{name:'Mountain',count:30}]}))});
  await completed;
  assert.equal(flashbackActionable,true,'graveyard Firebolt was never marked actionable');
  assert.equal(flashbackCast,true,'flashback cast never resolved into exile');
  console.log(JSON.stringify({engine:'forge',flashbackActionable:true,flashbackCast:true,fullGameVerified:false}));
}finally{
  clearTimeout(timer);
  await bridge.stop();
  await runtime.cleanup();
}
