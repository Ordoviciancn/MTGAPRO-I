import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareForgeLaunch } from '../src/server/forgeRuntime';
import { ForgeProcess } from '../src/server/forgeProcess';

// 验证看牌库顶静止式生效后，桥接快照中 libraryTop 是否以真实卡名揭示。
// 用法：forge-reveal-smoke.ts [lantern|glarb]（默认 lantern）。
// lantern：洞察明灯 MayLookAt$ Player，双方牌库顶对所有玩家揭示。
// glarb：格拉布 MayLookAt$ You，仅自己可见自己牌库顶，对手牌库顶保持隐藏。
const mode=process.argv[2]==='glarb'?'glarb':'lantern';
const hero=mode==='glarb'?"Glarb, Calamity's Augur":'Lantern of Insight';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.JAVA_HOME) throw new Error('JAVA_HOME must point to JDK 17.');
const runtime=await prepareForgeLaunch(root,process.env.JAVA_HOME);
runtime.launch.env={...runtime.launch.env,FORGE_TEST_SEED:'7'};
let finish!:()=>void, fail!:(e:Error)=>void;
const completed=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject;});
completed.catch(()=>undefined);
const timer=setTimeout(()=>fail(new Error('Reveal smoke timed out after 150 seconds.')),150000);
const answered=new Set<string>();
const snapshots=new Map<number,any>();
const landFlag=new Map<number,boolean>();
let heroOnBattlefield=false;
let revealVerified=false;
const bridge=new ForgeProcess(runtime.launch,message=>{
  if(message.type==='error') fail(new Error(String(message.message)));
  if(message.type==='state' && typeof message.seat==='number'){
    snapshots.set(message.seat,message);
    const me=message.players[message.seat];
    // 非自己主要阶段时重放地标位复位（state 广播持续到达，含对手回合）
    if(!(message.activePlayerId===me?.id&&/MAIN/i.test(String(message.phase))))landFlag.set(message.seat,false);
    if(me?.battlefield?.some((c:any)=>c.name===hero)){
      heroOnBattlefield=true;
      const detail=message.players.map((p:any)=>({name:p.libraryTop?.name,hidden:p.libraryTop?.hidden}));
      if(mode==='lantern'){
        // 洞察明灯：所有玩家可见所有牌库顶（MayLookAt$ Player）
        const allRevealed=message.players.every((p:any)=>p.libraryTop&&!p.libraryTop.hidden&&['Mountain',hero].includes(p.libraryTop.name));
        if(allRevealed){revealVerified=true;console.log(JSON.stringify({mode,reveal:detail}));finish();}
      } else {
        // 格拉布：仅自己可见自己牌库顶（MayLookAt$ You），对手牌库顶保持隐藏。
        // 注意：这里读的是桥接原始消息，无 hidden 字段；未揭示时桥接输出 name='Face-down card'。
        const mine=me?.libraryTop;
        const opp=message.players[1-message.seat]?.libraryTop;
        const visible=(t:any)=>t&&t.name!=='Face-down card';
        if(visible(mine)&&['Forest','Island','Swamp',hero].includes(mine.name)&&opp&&!visible(opp)){
          revealVerified=true;console.log(JSON.stringify({mode,reveal:detail}));finish();
        }
      }
    }
  }
  if(message.type==='prompt' && typeof message.requestId==='string' && !answered.has(message.requestId)){
    const seat=Number(message.seat);
    const state=snapshots.get(seat);
    const me=state?.players[seat];
    const heroCard=me?.hand?.find((c:any)=>c.name===hero);
    const land=me?.hand?.find((c:any)=>c.kind==='land'||['Mountain','Forest','Island','Swamp'].includes(c.name));
    const landCount=me?.battlefield?.filter((c:any)=>c.kind==='land').length??0;
    console.error(JSON.stringify({prompt:{seat,inputType:message.inputType,kind:message.kind,ok:message.okLabel,hand:me?.hand?.map((c:any)=>c.name),bf:me?.battlefield?.length}}));
    if(message.okEnabled===true && ['InputConfirm','InputConfirmMulligan'].includes(String(message.inputType))){
      answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
    } else if(message.kind==='choice' && Array.isArray(message.options) && message.options.length>0 && (String(message.options[0].label)==='Play land'||String(message.options[0].label).includes(hero.split(',')[0]))){
      answered.add(message.requestId);bridge.send({type:'choice',seat,requestId:message.requestId,value:0});
    } else if(String(message.inputType).startsWith('InputPayMana') && message.okEnabled===true){
      answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
    } else if(message.inputType==='InputPassPriority'){
      const myTurn=state?.activePlayerId===me?.id&&/MAIN/i.test(String(state?.phase));
      if(land && myTurn && landCount<(mode==='glarb'?3:1) && !landFlag.get(seat)){
        landFlag.set(seat,true);console.error(JSON.stringify({send:'selectCard land',active:state?.activePlayerId===me?.id}));answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:land.id});
      } else if(heroCard && myTurn && (mode==='lantern'?landCount>=1:landCount>=3) && !heroOnBattlefield){
        console.error(JSON.stringify({send:'selectCard hero',active:state?.activePlayerId===me?.id}));answered.add(message.requestId);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:heroCard.id});
      } else if(message.okEnabled===true){
        answered.add(message.requestId);bridge.send({type:'ok',seat,requestId:message.requestId});
      }
    }
  }
},fail);
try{
  await bridge.ready;
  const deck=mode==='glarb'
    ?[{name:hero,count:30},{name:'Forest',count:10},{name:'Island',count:10},{name:'Swamp',count:10}]
    :[{name:'Lantern of Insight',count:30},{name:'Mountain',count:30}];
  bridge.send({type:'init',players:['Human A','Human B'].map(name=>({name,deck}))});
  await completed;
  assert.equal(revealVerified,true,`libraryTop was not revealed while ${hero} is on the battlefield`);
  console.log(JSON.stringify({engine:'forge',mode,libraryTopRevealed:true,fullGameVerified:false}));
}finally{
  clearTimeout(timer);
  await bridge.stop();
  await runtime.cleanup();
}
