import {TunnelPanel} from './TunnelPanel';
import {useEffect,useState} from 'react';
import {formatDeck,loadDeckLibrary,parseDeckText,parseLibrary,saveDeckLibrary,type DeckLibrary,type DeckRow} from './deckLibrary';
import './lobby.css';
const webStorage={getItem:(key:string)=>localStorage.getItem(key),setItem:(key:string,value:string)=>localStorage.setItem(key,value)};

export interface ArenaLobbyProps {
  connected:boolean;name:string;onName:(value:string)=>void;deck:string;onDeck:(value:string)=>void;
  bestOf:1|3;onBestOf:(value:1|3)=>void;onCreate:()=>void;onJoin:(code:string)=>void;
  endpoint:string;defaultEndpoint?:string;onConnect:(url:string)=>void;onRefresh:()=>void;error?:string;
  rooms:{code:string;hostName:string;seats:number;bestOf:1|3;status:string}[];
}
export function ArenaLobby(props:ArenaLobbyProps){
  const [address,setAddress]=useState(props.endpoint),[code,setCode]=useState(''),[library,setLibrary]=useState<DeckLibrary>({version:1,decks:[]});
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[selected,setSelected]=useState('');
  const [deckName,setDeckName]=useState('我的牌组'),[cardName,setCardName]=useState(''),[sideboard,setSideboard]=useState(false),[raw,setRaw]=useState(false);
  useEffect(()=>{setAddress(props.endpoint);},[props.endpoint]);
  useEffect(()=>{let active=true;loadDeckLibrary(webStorage,window.mtgDesktop).then(value=>{if(active){setLibrary(value);setReady(true);}}).catch(error=>{if(active)setNotice(`读取失败：${String(error)}`);});return()=>{active=false;};},[]);
  let rows:DeckRow[]=[],validation='';try{rows=parseDeckText(props.deck);}catch(error){validation=String(error instanceof Error?error.message:error);}
  const main=rows.filter(row=>!row.sideboard).reduce((sum,row)=>sum+row.count,0),side=rows.filter(row=>row.sideboard).reduce((sum,row)=>sum+row.count,0);
  const playable=props.connected&&!validation&&main>0&&props.name.trim().length>0;
  async function persist(next:DeckLibrary){
    if(!ready||busy)return;setBusy(true);
    try{await saveDeckLibrary(next,webStorage,window.mtgDesktop);setLibrary(next);setNotice('牌组库已保存到本机。');}
    catch(error){setNotice(`保存失败，原有牌组未变更：${String(error)}`);throw error;}finally{setBusy(false);}
  }
  async function save(){
    if(validation||!deckName.trim()){setNotice(validation||'请输入牌组名称。');return;}
    const id=selected||crypto.randomUUID(),deck={id,name:deckName.trim(),text:props.deck,updatedAt:new Date().toISOString()};
    try{await persist({version:1,decks:[deck,...library.decks.filter(item=>item.id!==id)]});setSelected(id);}catch{}
  }
  function updateRows(next:DeckRow[]){try{const text=formatDeck(next);parseDeckText(text);props.onDeck(text);setNotice('');}catch(error){setNotice(String(error));}}
  function addCard(){const name=cardName.trim();if(!name||/[\r\n]/.test(name))return;const existing=rows.find(row=>row.name===name&&row.sideboard===sideboard);updateRows(existing?rows.map(row=>row===existing?{...row,count:row.count+1}:row):[...rows,{name,count:1,sideboard}]);setCardName('');}
  function download(text:string,filename:string,type:string){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function importFile(file?:File){
    if(!file)return;if(file.size>512*1024){setNotice('文件不能超过 512 KiB。');return;}
    try{const text=await file.text();if(file.name.toLowerCase().endsWith('.json')){const imported=parseLibrary(text);const next={version:1 as const,decks:[...library.decks,...imported.decks.map(deck=>({...deck,id:crypto.randomUUID()}))]};await persist(next);}else{parseDeckText(text);props.onDeck(text);setSelected('');setDeckName(file.name.replace(/\.[^.]+$/,''));setNotice('牌表已导入，点击保存将其保留到本机。');}}catch(error){setNotice(`导入失败：${String(error)}`);}
  }
  return <section className="arena-lobby" aria-label="对局大厅">
    <header className="lobby-hero"><div><span className="lobby-eyebrow">MTGAPROⅠ · FORGE</span><h1>每一场对局，从这里开始</h1><p>整理你的牌组，选择服务器，迎接下一位对手。</p></div><span className={`lobby-status ${props.connected?'online':''}`} role="status">{props.connected?'已连接服务器':'正在等待连接'}</span></header>
    {(props.error||notice)&&<div className="lobby-notice" role="status">{props.error||notice}</div>}
    <div className="lobby-columns">
      <aside className="lobby-panel lobby-server"><span className="lobby-step">01 / 连接</span><h2>服务器</h2><label>玩家名称<input value={props.name} maxLength={64} onChange={e=>props.onName(e.target.value)}/></label><label>服务器地址<input value={address} placeholder="例如 https://mtg.example.com" onChange={e=>setAddress(e.target.value)}/></label><button className="lobby-primary" onClick={()=>props.onConnect(address)}>连接服务器</button>{props.defaultEndpoint&&<button onClick={()=>{setAddress(props.defaultEndpoint!);props.onConnect(props.defaultEndpoint!);}}>返回本机服务器</button>}<p className="lobby-help">远程联机时，双方连接同一服务器。房间只存在于该服务器运行期间。</p><TunnelPanel/><div className="lobby-divider"/><h3>我的牌组 <small>{library.decks.length} / 60</small></h3><div className="lobby-saved">{library.decks.length===0?<p className="lobby-help">保存第一套牌组后，会在这里显示。</p>:library.decks.map(item=><button className={selected===item.id?'selected':''} key={item.id} onClick={()=>{setSelected(item.id);setDeckName(item.name);props.onDeck(item.text);setNotice('已载入牌组。');}}><strong>{item.name}</strong><small>{new Date(item.updatedAt).toLocaleDateString()}</small></button>)}</div><button disabled={!ready||busy} onClick={()=>{setSelected('');setDeckName('新牌组');props.onDeck('');}}>＋ 新建牌组</button></aside>
      <section className="lobby-panel lobby-builder"><div className="lobby-heading"><div><span className="lobby-step">02 / 组牌</span><h2>牌组工坊</h2></div><div className="lobby-count"><strong>{main}</strong> 主牌 <span>＋ {side} 备牌</span></div></div><label>牌组名称<input value={deckName} maxLength={80} onChange={e=>setDeckName(e.target.value)}/></label><div className="lobby-toolbar"><button onClick={()=>setRaw(!raw)}>{raw?'查看卡牌列表':'编辑 / 粘贴牌表'}</button><label className="lobby-file">导入文件<input type="file" accept=".txt,.dec,.json" disabled={!ready||busy} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label><button onClick={()=>download(props.deck,`${deckName||'牌组'}.txt`,'text/plain;charset=utf-8')}>导出牌表</button></div>
        {raw?<textarea className="lobby-decktext" aria-label="主牌与备牌牌表" value={props.deck} placeholder={'4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Pyroblast'} onChange={e=>props.onDeck(e.target.value)} maxLength={16000}/>:<><div className="lobby-add"><input aria-label="新增英文牌名" placeholder="输入英文牌名，例如 Lightning Bolt" value={cardName} maxLength={200} onChange={e=>setCardName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCard();}}/><select aria-label="加入区域" value={sideboard?'side':'main'} onChange={e=>setSideboard(e.target.value==='side')}><option value="main">主牌</option><option value="side">备牌</option></select><button disabled={!!validation||!cardName.trim()} onClick={addCard}>加入</button></div><div className="lobby-cardlist">{[false,true].map(isSide=><div key={String(isSide)}><h3>{isSide?'备牌':'主牌'} <small>{isSide?side:main} 张</small></h3>{rows.filter(row=>row.sideboard===isSide).map(row=><div className="lobby-cardrow" key={`${row.sideboard}:${row.name}`}><span title={row.name}>{row.name}</span><button aria-label={`减少 ${row.name} ${isSide?'备牌':'主牌'}`} onClick={()=>updateRows(rows.flatMap(item=>item===row?(item.count>1?[{...item,count:item.count-1}]:[]):[item]))}>−</button><strong>{row.count}</strong><button aria-label={`增加 ${row.name} ${isSide?'备牌':'主牌'}`} onClick={()=>updateRows(rows.map(item=>item===row?{...item,count:item.count+1}:item))}>＋</button><button title="移到另一区域" aria-label={`移动 ${row.name}`} onClick={()=>updateRows(rows.map(item=>item===row?{...item,sideboard:!item.sideboard}:item))}>⇄</button></div>)}</div>)}{!rows.length&&<p className="lobby-help">从英文牌名开始组牌，或导入已有的主牌与备牌牌表。</p>}</div></>}
        {validation&&<p className="lobby-invalid" role="alert">{validation} 请打开“编辑 / 粘贴牌表”修正。</p>}<div className="lobby-toolbar lobby-save"><button className="lobby-primary" disabled={!ready||busy||!!validation} onClick={()=>void save()}>{busy?'正在保存…':selected?'保存修改':'保存牌组'}</button><button disabled={!selected||busy||!ready} onClick={()=>{void persist({version:1,decks:library.decks.filter(item=>item.id!==selected)}).then(()=>setSelected('')).catch(()=>{});}}>删除已保存牌组</button><button disabled={!ready||!library.decks.length} onClick={()=>download(JSON.stringify(library,null,2),'牌组库.json','application/json')}>备份牌组库</button></div><p className="lobby-help">牌组保存在本机；网页清理站点数据会删除本地记录，请定期导出备份。服务器使用 Forge 加载卡牌；此编辑器暂不校验赛制禁限表。</p>
      </section>
      <aside className="lobby-panel lobby-rooms"><span className="lobby-step">03 / 开始对局</span><h2>对局大厅</h2><label>对局方式<select value={props.bestOf} onChange={e=>props.onBestOf(Number(e.target.value) as 1|3)}><option value={3}>BO3 · 三局两胜 / 局间换备</option><option value={1}>BO1 · 单局对决</option></select></label><button className="lobby-primary lobby-create" disabled={!playable} onClick={props.onCreate}>创建房间 <span>→</span></button><div className="lobby-join"><input aria-label="房间码" placeholder="输入房间码" value={code} maxLength={8} onChange={e=>setCode(e.target.value.toUpperCase().trim())}/><button disabled={!playable||!code.trim()} onClick={()=>props.onJoin(code.trim())}>加入</button></div><div className="lobby-divider"/><div className="lobby-heading"><h3>可用房间</h3><button disabled={!props.connected} onClick={props.onRefresh}>刷新</button></div><div className="lobby-roomlist">{props.rooms.length===0?<div className="lobby-empty"><span>◇</span><p>尚无公开房间</p><small>创建房间，邀请对手加入。</small></div>:props.rooms.map(room=><button className="lobby-room" key={room.code} disabled={!playable||room.seats>=2||room.status!=='waiting'} onClick={()=>props.onJoin(room.code)}><strong>{room.hostName} 的房间</strong><span>{room.code} · BO{room.bestOf} · {room.seats}/2</span><small>{room.status==='waiting'?'等待对手':'对局进行中'}</small></button>)}</div></aside>
    </div>
  </section>;
}
