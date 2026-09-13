import {useState} from 'react';
import type {ArenaCard,ArenaEvent,ArenaPlayer} from '../shared/arenaProtocol';
import './stackPanel.css';

const art=(name?:string)=>!name||name==='Face-down card'?'/mtg-card-back.png':`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;

export function StackPanel({cards,history,players,onInspect,onDismiss,onSelect}:{cards:ArenaCard[];history:ArenaEvent[];players:ArenaPlayer[];onInspect:(card:ArenaCard)=>void;onDismiss:()=>void;onSelect:(card:ArenaCard)=>void}){
  const [expanded,setExpanded]=useState(false);
  const [minimized,setMinimized]=useState(true);
  const recent=[...history].reverse();
  return <aside className={`arena-stack-panel${minimized?' is-minimized':''}`} aria-label="堆叠与结算记录">
    <button type="button" className="arena-stack-panel-toggle" aria-expanded={!minimized} aria-label={minimized?`打开堆叠与结算记录，当前 ${cards.length} 项`:'最小化整个结算记录面板'} onClick={()=>{onDismiss();setMinimized(value=>!value);}}><span>堆叠 / 结算记录</span><b>{cards.length}</b><small>{minimized?'打开':'— 最小化'}</small></button>
    {!minimized&&<>
    {!cards.length&&!recent.length&&<p className="arena-stack-empty">当前没有堆叠或结算记录。</p>}
    {!cards.length&&recent[0]&&<section className="arena-stack-last" aria-label="最近结算展示"><img src={art(recent[0].data.name)} alt={recent[0].data.name??'未公开来源'}/><div><small>{recent[0].kind==='cast'?'最近进入堆叠':recent[0].data.fizzled?'未能结算':'最近结算'} · {recent[0].data.ability?'异能':'咒语'}</small><strong>{recent[0].data.name??'未公开来源'}</strong>{recent[0].data.description&&<p>{recent[0].data.description}</p>}</div></section>}
    {!!cards.length&&<ol className="arena-stack-live">{cards.map((card,index)=><li key={card.stackId??card.id} className={card.ability?'is-ability':''}>
      <div className="arena-stack-meta"><span>{card.ability?'异能':'咒语'}</span><small>{players.find(p=>p.id===card.controllerId)?.name}</small></div>
      <button className="arena-stack-art" data-card-id={card.id} aria-label={`查看${card.ability?'异能':'咒语'}：${card.name}`} onMouseEnter={()=>onInspect(card)} onMouseLeave={onDismiss} onFocus={()=>onInspect(card)} onBlur={onDismiss} onClick={()=>onSelect(card)}><img src={art(card.hidden?undefined:card.name)} alt={card.name} draggable={false}/></button>
      <div className="arena-stack-description"><strong>{card.hidden?'牌面朝下的咒语':card.name}</strong>{card.description&&<p>{card.description}</p>}<small>堆叠位置 {index+1}</small></div>
    </li>)}</ol>}
    {!!recent.length&&<section className="arena-stack-recent" aria-label="最近释放与结算">
      <button className="arena-stack-history-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>最近释放与结算 <span>{expanded?'仅看最近 3 条':'查看更多'}</span></button>
      <ol>{recent.slice(0,expanded?16:3).map(event=><li key={event.sequence}>
        <img src={art(event.data.name)} alt="" loading="lazy"/>
        <div><small className={event.kind==='cast'?'cast':event.data.fizzled?'fizzled':'resolved'}>{event.kind==='cast'?'进入堆叠':event.data.fizzled?'未能结算':'已结算'} · {event.data.ability?'异能':'咒语'}</small><strong>{event.data.name??'未公开来源'}</strong>{event.data.description&&<p>{event.data.description}</p>}<small>{players.find(p=>p.id===event.data.playerId)?.name}</small></div>
      </li>)}</ol>
    </section>}
    </>}
  </aside>;
}
