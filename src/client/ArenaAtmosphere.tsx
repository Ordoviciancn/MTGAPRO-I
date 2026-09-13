import {useId,type CSSProperties} from 'react';

export function ArenaAtmosphere(){
  return <div className="forge-atmosphere" aria-hidden="true">
    <div className="forge-light-wash"/>
    <div className="forge-table-edge"/>
    {Array.from({length:12},(_,index)=><i key={index} className="forge-mote" style={{left:`${8+(index*37)%86}%`,top:`${15+(index*23)%65}%`,'--drift':`${index%2?24:-24}px`,animationDelay:`${-index*1.7}s`,animationDuration:`${12+index%5*2}s`} as CSSProperties}/>)}
  </div>;
}

export function AvatarCrest(){
  const id=useId().replace(/:/g,'');
  return <svg className="forge-avatar-crest" viewBox="0 0 110 110" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-rim`} x1="18" y1="12" x2="92" y2="101" gradientUnits="userSpaceOnUse"><stop stopColor="#fff0bd"/><stop offset=".18" stopColor="#a77b3d"/><stop offset=".5" stopColor="#f0d79b"/><stop offset=".67" stopColor="#67502f"/><stop offset="1" stopColor="#d2ad67"/></linearGradient>
      <radialGradient id={`${id}-face`} cx="0" cy="0" r="1" gradientTransform="translate(42 29) rotate(58) scale(70)"><stop stopColor="#334d59"/><stop offset=".52" stopColor="#142831"/><stop offset="1" stopColor="#071117"/></radialGradient>
      <linearGradient id={`${id}-mark`} x1="35" y1="32" x2="73" y2="75" gradientUnits="userSpaceOnUse"><stop stopColor="#fff1c4"/><stop offset=".45" stopColor="#d9b76e"/><stop offset="1" stopColor="#80602f"/></linearGradient>
    </defs>
    <circle className="crest-shadow" cx="55" cy="57" r="52"/>
    <circle className="crest-metal-rim" cx="55" cy="54" r="51" style={{stroke:`url(#${id}-rim)`}}/>
    <circle className="crest-enamel" cx="55" cy="54" r="45" style={{fill:`url(#${id}-face)`}}/>
    <path className="crest-emblem" style={{fill:`url(#${id}-mark)`}} d="M55 25 61 41 84 34 70 52 84 62 63 61 55 81 47 61 26 62 40 52 26 34 49 41Z"/>
    <path className="crest-emblem-cut" d="m55 35 4 13 13-5-9 11 9 5-13-2-4 14-4-14-13 2 9-5-9-11 13 5Z"/>
    <path className="crest-highlight" d="M19 45A38 38 0 0 1 83 22"/>
  </svg>;
}
