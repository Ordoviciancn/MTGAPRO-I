import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareForgeLaunch } from '../src/server/forgeRuntime';
import { ForgeProcess } from '../src/server/forgeProcess';

// 验证传记（Saga）在无头桥接下的端到端行为（克撒传）：
// 1) 点击手牌中的克撒传作为地落打进战场（传记本身是地，进场横置）；
// 2) 维持阶段自动加蓄力（LORE）指示物：第三章在第三个维持自动弹出检索窗口（{0}/{1} 神器直接进场）；
// 3) 点击战场上的克撒传 → 引擎弹出异能选择窗口（第一章获得的 {T} 产费与第二章获得的 {2},{T} 造衍生物），
//    选择衍生物异能并自动支付 → 构造体衍生物出现在战场。
// 说明：传记章节不是点击直接生效，而是通过点击弹出的异能选择窗口执行，与原生 Forge 一致。
const hero="Urza's Saga";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.JAVA_HOME) throw new Error('JAVA_HOME must point to JDK 17.');
const runtime=await prepareForgeLaunch(root,process.env.JAVA_HOME);
runtime.launch.env={...runtime.launch.env,FORGE_TEST_SEED:'11'};
let finish!:()=>void, fail!:(e:Error)=>void;
const completed=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject;});
completed.catch(()=>undefined);
const timer=setTimeout(()=>fail(new Error('Saga smoke timed out after 240 seconds.')),240000);
const answered=new Set<string>();
const snapshots=new Map<number,any>();
const landFlag=new Map<number,boolean>();
let sagaCast=false;
let searchSeen=false;
let tokenChosen=false,manaChosen=false,manaAbilityOffered=false,tokenSeen=false;
const bridge=new ForgeProcess(runtime.launch,message=>{
  if(message.type==='error') fail(new Error(String(message.message)));
  if(message.type==='state' && typeof message.seat==='number'){
    snapshots.set(message.seat,message);
    const me=message.players[message.seat];
    if(!(message.activePlayerId===me?.id&&/MAIN/i.test(String(message.phase))))landFlag.set(message.seat,false);
    const saga=me?.battlefield?.find((c:any)=>c.name===hero);
    if(saga)sagaCast=true;
    if(me?.battlefield?.some((c:any)=>/construct|组构体/i.test(String(c.name))&&c.kind==='creature'))tokenSeen=true;
    if(sagaCast&&tokenChosen&&tokenSeen&&searchSeen&&manaAbilityOffered){
      console.log(JSON.stringify({saga:{counters:saga?.counters??null,tapped:!!saga?.tapped},bf:me.battlefield.map((c:any)=>({name:c.name,kind:c.kind,tapped:!!c.tapped,counters:c.counters??null}))}));
      finish();
    }
  }
  if(message.type==='prompt' && typeof message.requestId==='string' && !answered.has(message.requestId)){
    const seat=Number(message.seat);
    const state=snapshots.get(seat);
    const me=state?.players[seat];
    const land=me?.hand?.find((c:any)=>c.name==='Plains');
    const sagaCard=me?.hand?.find((c:any)=>c.name===hero);
    const landCount=me?.battlefield?.filter((c:any)=>c.kind==='land').length??0;
    console.error(JSON.stringify({prompt:{seat,inputType:message.inputType,kind:message.kind,ok:message.okLabel,options:message.options?.slice(0,4),hand:me?.hand?.map((c:any)=>c.name),landCount,phase:state?.phase,activeIsMe:state?.activePlayerId===me?.id,sagaCast,landFlag:landFlag.get(seat),bf:me?.battlefield?.map((c:any)=>c.name)}}));
    if(message.okEnabled===true && ['InputConfirm','InputConfirmMulligan'].includes(String(message.inputType))){
      answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
    } else if(message.kind==='choice' && Array.isArray(message.options) && message.options.length>0){
      // 选择窗口按目标优先匹配：第三章检索（扑翼机）、第二章衍生物异能、第一章产费异能，其余直接应答。
      const labels=message.options.map((o:any)=>String(o.label));
      const orn=labels.findIndex(l=>/Ornithopter|扑翼机/i.test(l));
      const token=labels.findIndex(l=>/\{2\}|组构体|construct|token/i.test(l));
      const mana=labels.findIndex(l=>/add \{c\}|添加/i.test(l));
      if(mana>=0)manaAbilityOffered=true;
      let pick=0;
      if(orn>=0){searchSeen=true;console.error(JSON.stringify({send:'choice chapter-search',label:labels[orn]}));pick=orn;}
      else if(token>=0&&!tokenChosen){tokenChosen=true;console.error(JSON.stringify({send:'choice token-ability',label:labels[token]}));pick=token;}
      else if(mana>=0&&!manaChosen){manaChosen=true;console.error(JSON.stringify({send:'choice mana-ability',label:labels[mana]}));pick=mana;}
      answered.add(message.requestId);
      bridge.send({type:'choice',seat,requestId:message.requestId,value:pick});
    } else if(String(message.inputType).startsWith('InputPayMana') && message.okEnabled===true){
      answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
    } else if(message.inputType==='InputPassPriority'){
      const myTurn=state?.activePlayerId===me?.id&&/MAIN/i.test(String(state?.phase));
      const bfSaga=me?.battlefield?.find((c:any)=>c.name===hero);
      if(sagaCard && myTurn && !sagaCast && !landFlag.get(seat) && landCount>=2){
        // 克撒传本身是地：前两回合放平原，第三回合用克撒传占地落。
        landFlag.set(seat,true);console.error(JSON.stringify({send:'selectCard saga-land'}));answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:sagaCard.id});
      } else if(land && myTurn && landCount<2 && !landFlag.get(seat)){
        landFlag.set(seat,true);console.error(JSON.stringify({send:'selectCard land'}));answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:land.id});
      } else if(bfSaga && myTurn && !bfSaga.tapped && !tokenChosen && !landFlag.get(seat)){
        // 点击战场上的传记 → 引擎弹出异能选择窗口（第一章产费/第二章造token，随章节解锁）。
        console.error(JSON.stringify({send:'selectCard saga-ability',counters:bfSaga.counters??null}));answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:bfSaga.id});
      } else if(message.okEnabled===true){
        answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
      }
    } else {
      // 未知输入（含 cleanup 强制弃牌）：选择一张高亮（actionable）手牌交给引擎校验；否则允许时确认通过。
      const selectable=me?.hand?.find((c:any)=>c.actionable);
      if(selectable){console.error(JSON.stringify({send:'selectCard fallback',inputType:message.inputType}));answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:selectable.id});}
      else if(message.okEnabled===true){
        answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
      }
    }
  }
},fail);
try{
  await bridge.ready;
  bridge.send({type:'init',players:[{name:'Human A',deck:[{name:hero,count:20},{name:'Plains',count:30},{name:'Ornithopter',count:10}]},{name:'Human B',deck:[{name:'Plains',count:60}]}]});
  await completed;
  assert.equal(sagaCast,true,'Urza\'s Saga was not put onto the battlefield');
  assert.equal(manaAbilityOffered,true,'Ability chooser never offered the mana ability');
  assert.equal(tokenChosen,true,'Ability chooser never offered the Construct token ability');
  assert.equal(searchSeen,true,'Chapter III search window never appeared');
  assert.equal(tokenSeen,true,'Chapter II Construct token was not created');
  console.log(JSON.stringify({engine:'forge',sagaLandDrop:true,abilityChooser:true,chapterSearch:true,chapterToken:true,manaAbilityChosen:manaChosen,fullGameVerified:false}));
}finally{
  clearTimeout(timer);
  await bridge.stop();
  await runtime.cleanup();
}
