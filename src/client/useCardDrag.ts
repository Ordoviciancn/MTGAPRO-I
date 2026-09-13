import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {ArenaCard} from '../shared/arenaProtocol';

type Drag={card:ArenaCard;pointerId:number;startX:number;startY:number;x:number;y:number;originX:number;originY:number;width:number;height:number;active:boolean;returning:boolean};
export function useCardDrag(enabled:boolean,onDrop:(card:ArenaCard)=>void){
  const [drag,setDrag]=useState<Drag|null>(null),current=useRef<Drag|null>(null),ignoreClick=useRef(false),callback=useRef(onDrop),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  callback.current=onDrop;
  const frame=useRef<number|null>(null);
  function update(value:Drag|null,defer=false){
    current.current=value;
    if(defer){if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;setDrag(current.current);});}
    else {if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;setDrag(value);}
  }
  useEffect(()=>{
    if(!enabled){clearTimeout(timer.current);update(null);}
  },[enabled]);
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      const item=current.current;if(!item||item.returning||event.pointerId!==item.pointerId)return;
      const active=item.active||Math.hypot(event.clientX-item.startX,event.clientY-item.startY)>6;
      if(active){event.preventDefault();ignoreClick.current=true;}
      if(active)update({...item,x:event.clientX,y:event.clientY,active},true);
    };
    const finish=(event:PointerEvent)=>{
      const item=current.current;if(!item||event.pointerId!==item.pointerId)return;
      if(!item.active){update(null);return;}
      const target=document.elementFromPoint(event.clientX,event.clientY);
      const valid=event.type==='pointerup'&&!!target?.closest('.forge-board')&&!target.closest('.forge-zones,.forge-hand,.forge-input');
      if(valid){update(null);callback.current(item.card);}
      else {update({...item,returning:true,x:item.startX,y:item.startY});timer.current=setTimeout(()=>update(null),220);}
    };
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
    return()=>{clearTimeout(timer.current);if(frame.current!==null)cancelAnimationFrame(frame.current);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);};
  },[]);
  function begin(event:ReactPointerEvent<HTMLButtonElement>,card:ArenaCard){
    if(!enabled||event.button!==0)return;
    clearTimeout(timer.current);ignoreClick.current=false;
    const rect=event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    update({card,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,originX:rect.x+rect.width/2,originY:rect.y+rect.height/2,width:event.currentTarget.offsetWidth,height:event.currentTarget.offsetHeight,active:false,returning:false});
  }
  function consumeClick(){const ignored=ignoreClick.current;ignoreClick.current=false;return ignored;}
  return {drag:drag?.active?drag:null,begin,consumeClick};
}
