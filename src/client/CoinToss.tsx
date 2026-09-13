import {useEffect,useState,type ReactNode} from 'react';

export function CoinToss({winner,onComplete,children}:{winner:string;onComplete:()=>void;children?:ReactNode}){
  const [landed,setLanded]=useState(false);
  useEffect(()=>{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const landing=setTimeout(()=>{setLanded(true);onComplete();},reduced?0:1700);
    return()=>{clearTimeout(landing);};
  },[onComplete]);
  return <section className={`forge-coin-overlay ${landed?'landed':''}`} role="status" aria-label="投掷硬币">
    <div className="forge-coin-stage"><div className="forge-coin"><div className="coin-face coin-front"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42"/><path d="m50 15 8 24 25-8-16 20 16 20-25-8-8 24-8-24-25 8 16-20-16-20 25 8Z"/><circle cx="50" cy="51" r="10"/></svg></div><div className="coin-face coin-back">☾</div></div><i className="coin-shadow"/></div>
    <h2>{landed?`${winner} 获得先后手选择权`:'投掷硬币'}</h2><p>{landed?'正面已落定':'由规则引擎决定结果'}</p>
    {landed?<div className="forge-coin-choice">{children}</div>:<button onClick={()=>{setLanded(true);onComplete();}}>跳过动画</button>}
  </section>;
}
