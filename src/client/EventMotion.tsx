import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {ArenaEvent,ArenaSnapshot} from '../shared/arenaProtocol';
import {LocalizedCardImage} from './LocalizedCard';
type Cue={id:string;kind:'flight'|'attack'|'impact';x:number;y:number;dx:number;dy:number;name?:string;image?:string;until:number};
export function EventMotion({events,ownPlayerId,baseline}:{events:ArenaEvent[];ownPlayerId:string;baseline:number}){
 const last=useRef(baseline),combat=useRef(new Map<string,string>()),[cues,setCues]=useState<Cue[]>([]);
 useEffect(()=>{
  const anchor=(card?:string,player?:string,zone?:string)=>{
   const selector=card?`[data-card-id="${CSS.escape(card)}"]`:zone?`[data-zone="${zone}"][data-zone-player="${CSS.escape(player||'')}"]`:`[data-player-id="${CSS.escape(player||'')}"]`;
   const element=document.querySelector(selector),rect=element?.getBoundingClientRect();
   return {x:rect?rect.x+rect.width/2:innerWidth*.5,y:rect?rect.y+rect.height/2:innerHeight*(player===ownPlayerId?.78:.18),image:element?.querySelector('img')?.src};
  };
  const next:Cue[]=[],now=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden;
  for(const event of events){
   if(event.sequence<=last.current)continue;last.current=event.sequence;
   if(reduced)continue;
   const d=event.data;
   if(event.kind==='combat'){
    const current=new Map<string,string>();
    for(const attack of d.combat??[]){
     const signature=JSON.stringify(attack);current.set(attack.attackerId,signature);
     if(combat.current.get(attack.attackerId)===signature)continue;
     const from=anchor(attack.attackerId),to=anchor(attack.blockerIds[0]||attack.defenderCardId,attack.defenderPlayerId);
     next.push({id:`${event.sequence}:${attack.attackerId}`,kind:'attack',...from,dx:(to.x-from.x)*.3,dy:(to.y-from.y)*.3,until:now+620});
    }combat.current=current;
   }else if(event.kind==='zone'&&['Hand','Battlefield','Graveyard','Exile'].includes(d.to||'')){
    const from=anchor(undefined,d.playerId,d.from),to=anchor(d.cardId,d.playerId,d.to);
    next.push({id:String(event.sequence),kind:'flight',...from,image:undefined,dx:to.x-from.x,dy:to.y-from.y,name:d.name,until:now+650});
   }else if(event.kind==='cast'){
    const from=anchor(undefined,d.playerId,'Hand');
    next.push({id:String(event.sequence),kind:'flight',...from,image:undefined,dx:innerWidth*.77-from.x,dy:innerHeight*.36-from.y,name:d.name,until:now+650});
   }else if(event.kind==='damage'||event.kind==='life'&&(d.after??0)<(d.before??0)){
    const point=anchor(d.cardId,d.playerId);next.push({id:String(event.sequence),kind:'impact',...point,dx:0,dy:0,until:now+500});
   }
  }
  if(next.length)setCues(old=>[...old.filter(c=>c.until>now),...next].slice(-24));
 },[events,ownPlayerId]);
 useEffect(()=>{
  if(!cues.length)return;
  const timer=setTimeout(()=>setCues(old=>old.filter(c=>c.until>performance.now())),Math.max(0,Math.min(...cues.map(c=>c.until))-performance.now())+20);
  return()=>clearTimeout(timer);
 },[cues]);
 useEffect(()=>{const hide=()=>{if(document.hidden)setCues([]);};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 return <div className="event-motion" aria-hidden="true">{cues.map(c=><div key={c.id} className={`event-cue event-${c.kind}`} style={{left:c.x,top:c.y,'--dx':`${c.dx}px`,'--dy':`${c.dy}px`} as CSSProperties}>{c.kind==='impact'?<i/>:c.image?<img src={c.image} alt=""/>:<LocalizedCardImage name={c.name}/>}</div>)}</div>;
}
export function GameResult({state,playerId}:{state:ArenaSnapshot;playerId:string}){
 const [dismissed,setDismissed]=useState('');
 if(!state.gameOver||!state.winnerPlayerIds)return null;
 const result=state.winnerPlayerIds.length?(state.winnerPlayerIds.includes(playerId)?'victory':'defeat'):'draw',key=`${state.gameNumber}:${result}`;
 if(dismissed===key)return null;
 return <section className={`game-result ${result}`} role="dialog" aria-modal="false" aria-label="对局结果"><div className="result-rays"/><div className="result-emblem">{result==='victory'?'✦':result==='defeat'?'◇':'—'}</div><small>{state.matchOver?'比赛结束':`第 ${state.gameNumber??1} 局结束`}</small><h1>{result==='victory'?'胜利':result==='defeat'?'落败':'平局'}</h1><p>{state.bestOf===3?`比分 ${state.scores?.join(' : ')??''}`:'感谢对局'}</p><button autoFocus onClick={()=>setDismissed(key)}>查看牌桌</button></section>;
}
