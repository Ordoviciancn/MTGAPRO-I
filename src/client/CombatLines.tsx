import {useLayoutEffect,useRef} from 'react';
import type {ArenaCombat} from '../shared/arenaProtocol';

export function CombatLines({combat}:{combat:ArenaCombat[]}){
  const layer=useRef<SVGSVGElement>(null);
  useLayoutEffect(()=>{
    const svg=layer.current;if(!svg||!combat.length)return;
    const board=svg.parentElement!;let frame=0;
    const paths=combat.flatMap(attack=>[
      {from:attack.attackerId,to:attack.defenderCardId??attack.defenderPlayerId!,player:!attack.defenderCardId,kind:'attack'},
      ...attack.blockerIds.map(id=>({from:id,to:attack.attackerId,player:false,kind:'block'}))
    ]);
    const elements=paths.map(path=>{const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('class',`forge-combat-${path.kind}`);line.setAttribute('marker-end',`url(#forge-${path.kind}-arrow)`);svg.appendChild(line);return line;});
    const render=()=>{
      const bounds=board.getBoundingClientRect();
      paths.forEach((path,i)=>{
        const source=board.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(path.from)}"]`);
        const target=board.querySelector<HTMLElement>(`[data-${path.player?'player':'card'}-id="${CSS.escape(path.to)}"]`);
        if(!source||!target){elements[i].setAttribute('d','');return;}
        const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();const x1=a.x+a.width/2-bounds.x,y1=a.y+a.height/2-bounds.y,x2=b.x+b.width/2-bounds.x,y2=b.y+b.height/2-bounds.y;
        elements[i].setAttribute('d',`M ${x1} ${y1} Q ${(x1+x2)/2+20} ${(y1+y2)/2} ${x2} ${y2}`);
      });frame=requestAnimationFrame(render);
    };frame=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(frame);elements.forEach(element=>element.remove());};
  },[combat]);
  return <svg ref={layer} className="forge-combat-lines" aria-hidden="true"><defs><marker id="forge-attack-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ffa76d"/></marker><marker id="forge-block-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#89dcff"/></marker></defs></svg>;
}
