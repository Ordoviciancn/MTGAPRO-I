import {useEffect,useRef,useState} from 'react';
import type {ArenaCard,ArenaEvent,ArenaPlayer} from '../shared/arenaProtocol';
import './stackPanel.css';
import {ChineseCardText,LocalizedCardImage,LocalizedName} from './LocalizedCard';


export function StackPanel({cards,history,players,onInspect,onDismiss,onSelect}:{cards:ArenaCard[];history:ArenaEvent[];players:ArenaPlayer[];onInspect:(card:ArenaCard)=>void;onDismiss:()=>void;onSelect:(card:ArenaCard)=>void}){
  const [open,setOpen]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const prevCount=useRef(0);
  useEffect(()=>{
    if(cards.length>0&&prevCount.current===0)setOpen(true);
    else if(cards.length===0&&prevCount.current>0)setOpen(false);
    prevCount.current=cards.length;
  },[cards.length]);
  const recent=[...history].reverse();
  return <>
    <button type="button" className={`arena-stack-tab${open?' is-open':''}`} aria-expanded={open} aria-controls="arena-stack-panel" aria-label={open?'收起堆叠与结算记录':`打开堆叠与结算记录，当前堆叠 ${cards.length} 项`} onClick={()=>{onDismiss();setOpen(value=>!value);}}>
      <span className="arena-stack-tab-arrow" aria-hidden="true">{open?'›':'‹'}</span>
      {cards.length>0&&<b className="arena-stack-tab-count">{cards.length}</b>}
    </button>
    {open&&<aside id="arena-stack-panel" className="arena-stack-panel" aria-label="堆叠与结算记录">
    {!cards.length&&!recent.length&&<p className="arena-stack-empty">当前没有堆叠或结算记录。</p>}
    {!cards.length&&recent[0]&&<section className="arena-stack-last" aria-label="最近结算展示"><LocalizedCardImage name={recent[0].data.name}/><div><small>{recent[0].kind==='cast'?'最近进入堆叠':recent[0].data.fizzled?'未能结算':'最近结算'} · {recent[0].data.ability?'异能':'咒语'}</small><strong><LocalizedName name={recent[0].data.name??'未公开来源'} hidden={!recent[0].data.name}/></strong>{recent[0].data.description&&<p>{recent[0].data.description}</p>}</div></section>}
    {!!cards.length&&<ol className="arena-stack-live">{cards.map((card,index)=><li key={card.stackId??card.id} className={card.ability?'is-ability':''}>
      <div className="arena-stack-meta"><span>{card.ability?'异能':'咒语'}</span><small>{players.find(p=>p.id===card.controllerId)?.name}</small></div>
      <button className="arena-stack-art" data-card-id={card.id} aria-label={`查看${card.ability?'异能':'咒语'}：${card.name}`} onMouseEnter={()=>onInspect(card)} onMouseLeave={onDismiss} onFocus={()=>onInspect(card)} onBlur={onDismiss} onClick={()=>onSelect(card)}><LocalizedCardImage name={card.name} hidden={card.hidden}/></button>
      <div className="arena-stack-description"><strong><LocalizedName name={card.name} hidden={card.hidden}/></strong>{card.description&&<p>{card.description}</p>}{!card.hidden&&<details><summary>中文牌文参考</summary><ChineseCardText name={card.name}/></details>}<small>堆叠位置 {index+1}</small></div>
    </li>)}</ol>}
    {!!recent.length&&<section className="arena-stack-recent" aria-label="最近释放与结算">
      <button className="arena-stack-history-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>最近释放与结算 <span>{expanded?'仅看最近 3 条':'查看更多'}</span></button>
      <ol>{recent.slice(0,expanded?16:3).map(event=><li key={event.sequence}>
        <LocalizedCardImage name={event.data.name} alt="" loading="lazy"/>
        <div><small className={event.kind==='cast'?'cast':event.data.fizzled?'fizzled':'resolved'}>{event.kind==='cast'?'进入堆叠':event.data.fizzled?'未能结算':'已结算'} · {event.data.ability?'异能':'咒语'}</small><strong><LocalizedName name={event.data.name??'未公开来源'} hidden={!event.data.name}/></strong>{event.data.description&&<p>{event.data.description}</p>}<small>{players.find(p=>p.id===event.data.playerId)?.name}</small></div>
      </li>)}</ol>
    </section>}
    </aside>}
  </>;
}
