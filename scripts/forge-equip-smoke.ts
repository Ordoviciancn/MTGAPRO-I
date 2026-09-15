import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareForgeLaunch } from '../src/server/forgeRuntime';
import { ForgeProcess } from '../src/server/forgeProcess';

// 验证武具佩戴端到端链路（巨槌 Colossus Hammer + 灰矮人 Gray Ogre）：
// 1) 施放武具与生物；2) 点击战场武具 → 引擎弹出异能选择窗（Equip {1}）；
// 3) 选择装备异能后在目标选择窗口点击生物 → 自动支付 → 佩戴生效；
// 4) 桥接投影：武具卡携带 attachedTo=宿主 id，宿主力量/防御反映加成（+10/+10 → 12/12）。
const hero='Colossus Hammer',targetName='Gray Ogre';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.JAVA_HOME) throw new Error('JAVA_HOME must point to JDK 17.');
const runtime=await prepareForgeLaunch(root,process.env.JAVA_HOME);
runtime.launch.env={...runtime.launch.env,FORGE_TEST_SEED:'11'};
let finish!:()=>void, fail!:(e:Error)=>void;
const completed=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject;});
completed.catch(()=>undefined);
const timer=setTimeout(()=>fail(new Error('Equip smoke timed out after 240 seconds.')),240000);
const answered=new Set<string>();
const snapshots=new Map<number,any>();
const landFlag=new Map<number,boolean>();
let heroCast=false,targetCast=false,targetSelected=false,attachedSeen=false;
const bridge=new ForgeProcess(runtime.launch,message=>{
  if(message.type==='error') fail(new Error(String(message.message)));
  if(message.type==='state' && typeof message.seat==='number'){
    snapshots.set(message.seat,message);
    const me=message.players[message.seat];
    if(!(message.activePlayerId===me?.id&&/MAIN/i.test(String(message.phase))))landFlag.set(message.seat,false);
    const target=me?.battlefield?.find((c:any)=>c.name===targetName);
    const heroBf=me?.battlefield?.find((c:any)=>c.name===hero);
    if(target&&target.kind==='creature')targetCast=true;
    if(heroBf)heroCast=true;
    if(targetCast&&heroCast&&heroBf&&target&&heroBf.attachedTo===target.id&&target.power===12&&target.toughness===12){
      attachedSeen=true;
      console.log(JSON.stringify({hero:{attachedTo:heroBf.attachedTo},target:{power:target.power,toughness:target.toughness},bf:me.battlefield.map((c:any)=>({name:c.name,attachedTo:c.attachedTo??null}))}));
      finish();
    }
  }
  if(message.type==='prompt' && typeof message.requestId==='string'){
    // 同一 requestId 会随按钮状态（updateButtons）重发：按键值去重，允许 okEnabled 翻转后再次应答。
    const key=`${message.requestId}:${message.inputType}:${message.okEnabled}`;
    if(answered.has(key))return;
    const seat=Number(message.seat);
    const state=snapshots.get(seat);
    const me=state?.players[seat];
    const land=me?.hand?.find((c:any)=>c.name==='Mountain');
    const heroCard=me?.hand?.find((c:any)=>c.name===hero);
    const targetCard=me?.hand?.find((c:any)=>c.name===targetName);
    const landCount=me?.battlefield?.filter((c:any)=>c.kind==='land').length??0;
    const heroBf=me?.battlefield?.find((c:any)=>c.name===hero);
    console.error(JSON.stringify({prompt:{seat,inputType:message.inputType,kind:message.kind,ok:message.okLabel,okEnabled:message.okEnabled,cancelEnabled:message.cancelEnabled,min:message.min,max:message.max,msg:String(message.message??'').slice(0,100),options:message.options?.slice(0,4),landCount,phase:state?.phase,activeIsMe:state?.activePlayerId===me?.id,heroCast,targetCast,targetSelected,bf:me?.battlefield?.map((c:any)=>({name:c.name,tapped:!!c.tapped}))}}));
    if(message.okEnabled===true && ['InputConfirm','InputConfirmMulligan'].includes(String(message.inputType))){
      answered.add(key);bridge.send({type:'ok',seat,requestId:message.requestId});
    } else if(message.kind==='choice' && Array.isArray(message.options) && message.options.length>0){
      // 异能选择窗：优先装备异能（Equip/装备/武具）；其余（施放等）直接选第一项。
      const labels=message.options.map((o:any)=>String(o.label));
      const equip=labels.findIndex(l=>/equip|装备|武具/i.test(l));
      let pick=0;
      if(equip>=0&&heroBf&&!heroBf.attachedTo){console.error(JSON.stringify({send:'choice equip',label:labels[equip]}));pick=equip;}
      answered.add(key);
      bridge.send({type:'choice',seat,requestId:message.requestId,value:pick});
    } else if(String(message.inputType).startsWith('InputPayMana')){
      // 启动式异能的支付窗初始 okEnabled=false：先点击未横置的山脉手动付费，付满后确认键才会启用。
      if(message.okEnabled===true){answered.add(key);bridge.send({type:'ok',seat,requestId:message.requestId});}
      else{const mtn=me?.battlefield?.find((c:any)=>c.name==='Mountain'&&!c.tapped);if(mtn){console.error(JSON.stringify({send:'selectCard pay-mana'}));answered.add(key);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:mtn.id});}}
    } else if(message.inputType==='InputPassPriority'){
      const myTurn=state?.activePlayerId===me?.id&&/MAIN/i.test(String(state?.phase));
      // 巨槌佩戴费用为 {8}：起手后持续铺地直到 8 块，确保佩戴支付窗口能付满。
      if(land && myTurn && landCount<8 && !landFlag.get(seat)){
        landFlag.set(seat,true);console.error(JSON.stringify({send:'selectCard land'}));answered.add(key);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:land.id});
      } else if(heroCard && myTurn && landCount>=1 && !heroCast && !landFlag.get(seat)){
        landFlag.set(seat,true);console.error(JSON.stringify({send:'selectCard hero-cast'}));answered.add(key);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:heroCard.id});
      } else if(targetCard && myTurn && landCount>=2 && !targetCast && !landFlag.get(seat)){
        landFlag.set(seat,true);console.error(JSON.stringify({send:'selectCard target-cast'}));answered.add(key);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:targetCard.id});
      } else if(heroBf && myTurn && targetCast && !heroBf.attachedTo && !landFlag.get(seat)){
        // 点击战场武具 → 引擎弹出异能选择窗（装备）。
        landFlag.set(seat,true);console.error(JSON.stringify({send:'selectCard hero-equip'}));answered.add(key);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:heroBf.id});
      } else if(message.okEnabled===true){
        answered.add(key);bridge.send({type:'ok',seat,requestId:message.requestId});
      }
    } else {
      // 目标选择（装备目标）等非模态输入：优先点选高亮生物，其次高亮手牌；允许时确认通过。
      const selectTarget=me?.battlefield?.find((c:any)=>c.actionable&&c.kind==='creature');
      const selectable=selectTarget??me?.hand?.find((c:any)=>c.actionable);
      if(selectable){
        if(String(message.inputType).includes('SelectTargets')&&selectable.kind==='creature')targetSelected=true;
        console.error(JSON.stringify({send:'selectCard fallback',inputType:message.inputType,card:selectable.name}));answered.add(key);bridge.send({type:'selectCard',seat,requestId:message.requestId,cardId:selectable.id});
      }
      else if(message.okEnabled===true){
        answered.add(key);bridge.send({type:'ok',seat,requestId:message.requestId});
      }
    }
  }
},fail);
try{
  await bridge.ready;
  bridge.send({type:'init',players:[{name:'Human A',deck:[{name:hero,count:8},{name:targetName,count:8},{name:'Mountain',count:44}]},{name:'Human B',deck:[{name:'Mountain',count:60}]}]});
  await completed;
  assert.equal(heroCast,true,'Colossus Hammer was not cast to the battlefield');
  assert.equal(targetCast,true,'Gray Ogre was not cast to the battlefield');
  assert.equal(targetSelected,true,'Equip target selection window never accepted a creature click');
  assert.equal(attachedSeen,true,'Equipment never attached: attachedTo projection or power/toughness bonus missing');
  console.log(JSON.stringify({engine:'forge',equipInteraction:true,attachmentProjection:true,fullGameVerified:false}));
}finally{
  clearTimeout(timer);
  await bridge.stop();
  await runtime.cleanup();
}
