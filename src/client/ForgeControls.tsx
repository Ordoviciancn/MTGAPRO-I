import { useState } from 'react';
import type { ForgeDecision, ForgePrompt } from '../shared/forgeTypes';

export function ForgeControls({prompt,fullControl,onControl,onDecision,english=false}:{prompt?:ForgePrompt;fullControl:boolean;onControl:(value:boolean)=>void;onDecision:(decision:ForgeDecision)=>void;english?:boolean}) {
  const text = (zh:string,en:string) => english ? en : zh;
  return <section className="forgeControls" aria-label={text('时点确认','Priority control')}>
    <label><input type="checkbox" checked={fullControl} onChange={event=>onControl(event.target.checked)}/>{text('完全操控','Full control')}</label>
    <span>{fullControl ? text('每个优先权窗口都等待确认','Confirm every priority window') : text('无可用动作时自动让过','Automatically pass when no actions are available')}</span>
    {!prompt && <strong>{text('等待规则引擎或对手','Waiting for engine or opponent')}</strong>}
    {prompt && <div>
      <p>{prompt.message}</p>
      {prompt.kind === 'input' && <div className="forgeDecisionButtons">
        <button disabled={!prompt.okEnabled} onClick={()=>onDecision({type:'ok',requestId:prompt.requestId})}>{prompt.okLabel || text('确认','Confirm')}</button>
        <button className="secondary" disabled={!prompt.cancelEnabled} onClick={()=>onDecision({type:'cancel',requestId:prompt.requestId})}>{prompt.cancelLabel || text('取消','Cancel')}</button>
      </div>}
      {(prompt.kind === 'choice'||prompt.kind==='order'||prompt.kind==='sideboard') && <ForgeChoice key={prompt.requestId} prompt={prompt} onDecision={onDecision} english={english}/>}
      {prompt.kind === 'number' && <ForgeNumber key={prompt.requestId} prompt={prompt} onDecision={onDecision} english={english}/>}
      {prompt.kind === 'unsupported' && <strong role="alert">{text('此决策尚未支持，游戏已暂停','This decision is not supported; the game is paused')}</strong>}
    </div>}
  </section>;
}

function ForgeNumber({prompt,onDecision,english}:{prompt:ForgePrompt;onDecision:(decision:ForgeDecision)=>void;english:boolean}){
  const [value,setValue]=useState(String(prompt.min??0));
  const number=Number(value),valid=value.trim()!==''&&Number.isSafeInteger(number)&&number>=(prompt.min??0)&&number<=(prompt.max??0);
  return <div><label>{english?'Value':'数值'}<input type="number" step="1" min={prompt.min} max={prompt.max} value={value} onChange={event=>setValue(event.target.value)}/></label><button disabled={!valid} onClick={()=>onDecision({type:'choice',requestId:prompt.requestId,value:number})}>{english?'Confirm value':'确认数值'}</button></div>;
}

function ForgeChoice({prompt,onDecision,english}:{prompt:ForgePrompt;onDecision:(decision:ForgeDecision)=>void;english:boolean}) {
  const [selected,setSelected]=useState<number[]>(()=>prompt.kind==='sideboard'?(prompt.options??[]).slice(0,prompt.initialMainSize??0).map(option=>option.value):prompt.kind==='order'&&prompt.min===prompt.options?.length?(prompt.options??[]).map(option=>option.value):[]);
  const min=prompt.min??1,max=prompt.max??1;
  return <div role="group" aria-label={prompt.message}>
    <div className="forgeChoices">{prompt.options?.map(option=><button key={option.value} aria-pressed={selected.includes(option.value)} onClick={()=>setSelected(values=>values.includes(option.value)?values.filter(value=>value!==option.value):max===1?[option.value]:values.length<max?[...values,option.value]:values)}>{prompt.kind==='sideboard'?(selected.includes(option.value)?textSideboard(english,true):textSideboard(english,false))+' · ':''}{option.label}</button>)}</div>
    {prompt.kind==='order'&&<ol className="forge-order">{selected.map((value,index)=><li key={value}><span>{prompt.options?.find(option=>option.value===value)?.label}</span><button aria-label={english?'Move earlier':'前移'} disabled={index===0} onClick={()=>setSelected(values=>{const next=[...values];[next[index-1],next[index]]=[next[index],next[index-1]];return next;})}>↑</button><button aria-label={english?'Move later':'后移'} disabled={index===selected.length-1} onClick={()=>setSelected(values=>{const next=[...values];[next[index],next[index+1]]=[next[index+1],next[index]];return next;})}>↓</button></li>)}</ol>}
    <button disabled={selected.length<min || selected.length>max} onClick={()=>onDecision({type:'choice',requestId:prompt.requestId,value:max===1&&selected.length===1?selected[0]:selected})}>{english?'Confirm selection':'确认选择'} ({selected.length}/{max})</button>
  </div>;
}

function textSideboard(english:boolean,main:boolean){return english?(main?'Main':'Sideboard'):(main?'主牌':'备牌');}
