import {useEffect,useState,useSyncExternalStore,type ImgHTMLAttributes} from 'react';
import {canLookup,chineseCard,type ChineseCard} from './chineseCards';
const cache=new Map<string,ChineseCard|undefined>(),pending=new Set<string>(),listeners=new Set<()=>void>();
let revision=0,queue=Promise.resolve();
const subscribe=(callback:()=>void)=>{listeners.add(callback);return()=>{listeners.delete(callback);};};
const snapshot=()=>revision;
// 通知失败不能中断串行队列，否则后续卡牌的汉化会全部停摆。
const notify=()=>{for(const callback of [...listeners]){try{callback();}catch{}}};
const chineseStorageKey='forge-chinese-cards';
let chineseOn=(()=>{try{return localStorage.getItem(chineseStorageKey)==='1';}catch{return false;}})();
const chineseListeners=new Set<()=>void>();
const maxAttempts=5;
const failures=new Map<string,number>();
export function setChineseCards(value:boolean){value=!!value;if(value===chineseOn)return;chineseOn=value;try{localStorage.setItem(chineseStorageKey,value?'1':'0');}catch{}
  if(value)failures.clear();
  chineseListeners.forEach(listener=>listener());}
const subscribeChinese=(listener:()=>void)=>{chineseListeners.add(listener);return()=>{chineseListeners.delete(listener);};};
export function useChineseCards(){return useSyncExternalStore(subscribeChinese,()=>chineseOn,()=>false);}
function request(name:string){
  if(cache.has(name)||pending.has(name)||pending.size>=256)return;
  const attempts=failures.get(name)??0;
  if(attempts>=maxAttempts)return;
  pending.add(name);
  const run=async()=>{
    let value:ChineseCard|undefined,resolved=false;
    try{
      const params=new URLSearchParams({q:`name=${JSON.stringify(name)}`,view:'0',page_size:'100',priority_chinese:'true',include_fav:'false'});
      const response=await fetch(`https://mtgch.com/api/v1/result?${params}`,{credentials:'omit',signal:AbortSignal.timeout(6000)});
      if(response.ok){const body=await response.json();if(Array.isArray(body.items)){value=chineseCard(name,body.items);resolved=true;}}
    }catch{}
    // 查询成功（含确认无翻译）才落缓存；超时、限流等失败进入退避重试，不再永久卡在英文。
    if(resolved){failures.delete(name);cache.set(name,value);if(cache.size>512)cache.delete(cache.keys().next().value!);}
    else{failures.set(name,attempts+1);if(attempts+1<maxAttempts)setTimeout(()=>{pending.delete(name);request(name);},Math.min(2500*2**attempts,30000));}
    pending.delete(name);
    revision++;notify();
    await new Promise(resolve=>setTimeout(resolve,200));
  };
  // 任一请求异常也不能断开队列。
  queue=queue.then(run,run);
}
export function useChineseCard(name?:string,hidden=false){
  const enabled=useChineseCards();
  useSyncExternalStore(subscribe,snapshot,snapshot);
  useEffect(()=>{if(enabled&&canLookup(name,hidden))request(name!);},[name,hidden,enabled]);
  return enabled&&canLookup(name,hidden)?cache.get(name!):undefined;
}
// 一键汉化进度：把牌组全部唯一牌名主动入队，供大厅进度条显示 x/y；完成=已落缓存或重试耗尽。
const enqueued=new Set<string>();
const progressListeners=new Set<()=>void>();
let progressRevision=0;
const notifyProgress=()=>{progressRevision++;for(const listener of [...progressListeners]){try{listener();}catch{}}};
export function requestChineseCards(names:string[]){
  const unique=[...new Set(names.map(name=>name.trim()).filter(name=>name&&canLookup(name)))];
  for(const name of unique){enqueued.add(name);request(name);}
  if(unique.length)notifyProgress();
}
export function useChineseProgress(){
  useSyncExternalStore(callback=>{progressListeners.add(callback);return()=>{progressListeners.delete(callback);};},()=>progressRevision,()=>0);
  // 请求完成会递增 revision 并 notify，进度随之刷新。
  useSyncExternalStore(subscribe,snapshot,snapshot);
  let done=0;for(const name of enqueued)if(cache.has(name)||(failures.get(name)??0)>=maxAttempts)done++;
  return {total:enqueued.size,done,active:enqueued.size>0&&done<enqueued.size};
}
// 衍生物卡图（各类 token、复制衍生物）：名称精确匹配失败后按 Scryfall token 印刷检索，结果按名称缓存。
const tokenCache=new Map<string,string|undefined>(),tokenPending=new Set<string>(),tokenListeners=new Set<()=>void>();
let tokenRevision=0;
const notifyToken=()=>{tokenRevision++;for(const listener of [...tokenListeners]){try{listener();}catch{}}};
function useTokenArt(name?:string,enabled=false){
  useSyncExternalStore(callback=>{tokenListeners.add(callback);return()=>{tokenListeners.delete(callback);};},()=>tokenRevision,()=>0);
  useEffect(()=>{
    if(!enabled||!name||tokenCache.has(name)||tokenPending.has(name))return;
    tokenPending.add(name);
    (async()=>{
      let art:string|undefined;
      try{
        const response=await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`t:token name:"${name}"`)}`,{credentials:'omit',signal:AbortSignal.timeout(6000)});
        if(response.ok){const body=await response.json();const first=Array.isArray(body.data)?body.data[0]:undefined;art=first?.image_uris?.normal??first?.card_faces?.[0]?.image_uris?.normal;}
      }catch{}
      tokenCache.set(name,art);if(tokenCache.size>256)tokenCache.delete(tokenCache.keys().next().value!);
      tokenPending.delete(name);notifyToken();
    })();
  },[name,enabled]);
  return enabled&&name?tokenCache.get(name):undefined;
}
export function LocalizedName({name,hidden=false}:{name:string;hidden?:boolean}){
  const card=useChineseCard(name,hidden);return <>{hidden?'牌面朝下':card?.zhName||name}</>;
}
export function LocalizedCardImage({name,hidden=false,token=false,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {name?:string;hidden?:boolean;token?:boolean}){
  const card=useChineseCard(name,hidden),[failed,setFailed]=useState<string[]>([]);
  const english=canLookup(name,hidden)?`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name!)}&format=image&version=normal`:'/mtg-card-back.png';
  // token 名称常带 Token 后缀且精确匹配往往失败；仅在精确卡图加载失败后才发起 token 印刷检索。
  const tokenName=token&&!hidden&&name?name.replace(/\s*Token$/i,''):undefined;
  const tokenArt=useTokenArt(tokenName,!!tokenName&&failed.includes(english));
  const preferred=card?.image||english;
  const chain=[preferred,english,tokenArt].filter((value,index,array):value is string=>!!value&&array.indexOf(value)===index);
  const src=chain.find(value=>!failed.includes(value))??'/mtg-card-back.png';
  return <img {...props} src={src} alt={props.alt??(hidden?'牌背':card?.zhName||name||'牌背')} draggable={false} referrerPolicy="no-referrer" onError={()=>setFailed(values=>values.includes(src)?values:[...values.slice(-3),src])}/>;
}
export function ChineseCardText({name,hidden=false}:{name:string;hidden?:boolean}){
  const card=useChineseCard(name,hidden);
  return card?.text?<div className="chinese-card-text"><strong>{card.zhName}</strong><p>{card.text}</p><small>{card.source} · 卡牌参考，实际结算以引擎为准</small></div>:null;
}
