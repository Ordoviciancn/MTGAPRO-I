import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import type {ArenaCard,ArenaEvent,ArenaRoomView,ArenaServerMessage,ArenaRoomListing} from '../shared/arenaProtocol';
import type {Command} from '../shared/matchProtocol';
import {connectionRecovery} from './connectionRecovery';
import {ForgeControls} from './ForgeControls';
import {SemanticCanvas} from './SemanticCanvas';
import {StackPanel} from './StackPanel';
import {appendStackEvent} from '../shared/stackHistory';
import {CombatLines} from './CombatLines';
import {arenaKeyboardIntent} from './arenaKeyboard';
import {ArenaAtmosphere,AvatarCrest} from './ArenaAtmosphere';
import {useCardDrag} from './useCardDrag';
import {CoinToss} from './CoinToss';
import {serverAddress,seatStorageKey} from './serverAddress';
import {ArenaLobby} from './ArenaLobby';
import './forgeArena.css';
import './forgeArt.css';

const defaultDeck='20 Mountain\n20 Forest\n4 Lightning Bolt\n4 Shock\n4 Llanowar Elves\n4 Grizzly Bears\n4 Giant Growth';
const label=(value:string)=>({Play:'先手',Draw:'后手',Keep:'保留',Mulligan:'调度',Auto:'自动支付',OK:'确认','End Turn':'让过本回合',Cancel:'取消'}[value]??value);
const phaseLabel=(value:string)=>({null:'准备对局',UNTAP:'重置',UPKEEP:'维持',DRAW:'抓牌',MAIN1:'战斗前主阶段',COMBAT_BEGIN:'战斗开始',COMBAT_DECLARE_ATTACKERS:'宣告攻击者',COMBAT_DECLARE_BLOCKERS:'宣告阻挡者',COMBAT_FIRST_STRIKE_DAMAGE:'先攻伤害',COMBAT_DAMAGE:'战斗伤害',COMBAT_END:'战斗结束',MAIN2:'战斗后主阶段',END_OF_TURN:'结束步骤',CLEANUP:'清除步骤'}[value]??value);
const imageUrl=(card:ArenaCard)=>card.hidden?'/mtg-card-back.png':`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`;

export function ArenaClient(){
  const defaultEndpoint=serverAddress(location.port==='5180'?`${location.protocol}//${location.hostname}:8787`:location.origin,location.protocol);
  const [endpoint,setEndpoint]=useState(()=>{try{return serverAddress(sessionStorage.getItem('forge-server')||defaultEndpoint,location.protocol);}catch{return defaultEndpoint;}}),[connectionEpoch,setConnectionEpoch]=useState(0);
  const [room,setRoom]=useState<ArenaRoomView|null>(null),[connected,setConnected]=useState(false),[error,setError]=useState('');
  const [rooms,setRooms]=useState<ArenaRoomListing[]>([]);
  const [name,setName]=useState('玩家'),[deck,setDeck]=useState(defaultDeck);
  const [bestOf,setBestOf]=useState<1|3>(3),[coinDone,setCoinDone]=useState<string|null>(null);
  const [pending,setPending]=useState(false),[events,setEvents]=useState<ArenaEvent[]>([]),[preview,setPreview]=useState<ArenaCard|null>(null);
  const [zone,setZone]=useState<{title:string;cards:ArenaCard[]}|null>(null);
  const [animationBaseline,setAnimationBaseline]=useState({epoch:0,sequence:0});
  const socket=useRef<WebSocket|null>(null),roomRef=useRef(room),lastSequence=useRef(0),pendingCommand=useRef<{command:Command;sent:boolean;sentAt:number}|null>(null);
  roomRef.current=room;
  useEffect(()=>{
    let closed=false,retry:ReturnType<typeof setTimeout>,attempt=0;
    const connect=()=>{
      const ws=new WebSocket(endpoint);socket.current=ws;
      ws.onerror=()=>{if(!closed&&socket.current===ws)setError('无法连接服务器，请检查地址、端口和服务器是否已启动。');};
      ws.onopen=()=>{
        if(closed){ws.close();return;}attempt=0;setConnected(true);setError('');
        const saved=sessionStorage.getItem(seatStorageKey(endpoint));
        if(saved){try{ws.send(JSON.stringify({type:'resume',credential:JSON.parse(saved)}));}catch{sessionStorage.removeItem(seatStorageKey(endpoint));}}
        else ws.send(JSON.stringify({type:'listRooms'}));
      };
      let hydrated=false,lastMessageAt=Date.now();
      const health=setInterval(()=>{
        if(closed||socket.current!==ws||ws.readyState!==WebSocket.OPEN)return;
        const recovery=connectionRecovery(Date.now(),lastMessageAt,pendingCommand.current?.sentAt);
        if(recovery==='reconnect'){
          setError('连接响应超时，正在恢复座位…');ws.close();return;
        }
        if(recovery==='retry'&&hydrated&&pendingCommand.current){
          pendingCommand.current.sentAt=Date.now();
          ws.send(JSON.stringify({type:'command',command:pendingCommand.current.command}));
          ws.send(JSON.stringify({type:'resync'}));
        }else if(recovery==='probe')ws.send(JSON.stringify({type:hydrated?'resync':'listRooms'}));
      },5000);
      ws.addEventListener('close',()=>clearInterval(health));
      ws.onmessage=e=>{
        if(closed||socket.current!==ws)return;
        lastMessageAt=Date.now();
        let message:ArenaServerMessage;try{message=JSON.parse(e.data);}catch{setError('服务器返回了无效消息。');return;}
        if(!message||typeof message.type!=='string')return;
        if(message.type==='roomClosed'){sessionStorage.removeItem(seatStorageKey(endpoint));connectServer(endpoint);return;}
        if(message.type==='rooms'&&Array.isArray(message.rooms))setRooms(message.rooms);
        if(message.type==='credential'){sessionStorage.setItem(seatStorageKey(endpoint),JSON.stringify(message.credential));}
        if(message.type==='view'){
          const first=roomRef.current?.matchId!==message.room.matchId;
          roomRef.current=message.room;setRoom(message.room);
          if(first||!hydrated){hydrated=true;lastSequence.current=message.room.snapshot?.lastEventSequence??0;setEvents([]);setAnimationBaseline(old=>({epoch:old.epoch+1,sequence:lastSequence.current}));}
          if(message.room.status==='failed'){pendingCommand.current=null;setPending(false);}
          // A reconnect reuses the command ID; the server ledger decides whether it already ran.
          if(pendingCommand.current && !pendingCommand.current.sent){pendingCommand.current.sent=true;pendingCommand.current.sentAt=Date.now();ws.send(JSON.stringify({type:'command',command:pendingCommand.current.command}));}
        }
        if(message.type==='event' && message.matchId===roomRef.current?.matchId && message.event.sequence>lastSequence.current){
          lastSequence.current=message.event.sequence;setEvents(old=>[...old.slice(-31),message.event]);
          if(message.event.kind==='cast'||message.event.kind==='resolve')setRoom(old=>old?.matchId===message.matchId?{...old,recentStackEvents:appendStackEvent(old.recentStackEvents??[],message.event)}:old);
        }
        if(message.type==='receipt'){
          if(message.receipt.commandId===pendingCommand.current?.command.commandId){pendingCommand.current=null;setPending(false);}
          if(message.receipt.status!=='accepted')setError(message.receipt.status==='resync'?'对局状态已更新，请重新选择。':'该操作已失效或不适用于当前窗口。');
        }
        if(message.type==='error'){setError(message.message);setPending(!!pendingCommand.current);if(message.message.includes('无法恢复座位')){sessionStorage.removeItem(seatStorageKey(endpoint));setRoom(null);roomRef.current=null;pendingCommand.current=null;ws.send(JSON.stringify({type:'listRooms'}));}}
      };
      ws.onclose=e=>{
        if(closed||socket.current!==ws)return;
        setConnected(false);if(pendingCommand.current)pendingCommand.current.sent=false;
        if(!closed && e.code!==4001)retry=setTimeout(connect,Math.min(1000*2**attempt++,10000));
        if(e.code===4001)setError('此座位已在另一个连接恢复。');
      };
    };
    connect();return()=>{closed=true;clearTimeout(retry);socket.current?.close();};
  },[endpoint,connectionEpoch]);
  function connectServer(address:string){
    try{const next=serverAddress(address,location.protocol);setError('');sessionStorage.setItem('forge-server',next);setConnected(false);setRooms([]);setRoom(null);roomRef.current=null;pendingCommand.current=null;setPending(false);setEndpoint(next);setConnectionEpoch(value=>value+1);}catch(error){setError((error as Error).message);}
  }
  function send(value:unknown){if(socket.current?.readyState===WebSocket.OPEN){setError('');socket.current.send(JSON.stringify(value));}}
  function command(operation:string,parameters:Record<string,unknown>={}){
    if(!room||pendingCommand.current||pending||!connected||room.status!=='playing'||coinPending)return;
    const command:Command={protocolVersion:1,matchId:room.matchId,playerId:room.playerId,commandId:crypto.randomUUID(),expectedRevision:room.revision,operation,parameters};
    pendingCommand.current={command,sent:true,sentAt:Date.now()};setPending(true);send({type:'command',command});
  }
  function selectCard(card:ArenaCard){if(room?.prompt?.kind==='input'&&card.actionable)command('selectCard',{requestId:room.prompt.requestId,cardId:card.id});}
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.defaultPrevented)return;
      const target=e.target instanceof Element?e.target:null;
      const intent=arenaKeyboardIntent({key:e.key,code:e.code,repeat:e.repeat,composing:e.isComposing,modified:e.altKey||e.ctrlKey||e.metaKey||e.shiftKey,
        interactive:!!target?.closest('button,input,textarea,select,a[href],[contenteditable]:not([contenteditable="false"]),[role="button"]'),
        overlay:!!zone||coinVisible,ready:connected&&!pending&&room?.status==='playing'&&!room.snapshot?.gameOver,prompt:room?.prompt??undefined});
      if(intent==='confirm'&&room?.prompt){e.preventDefault();command('ok',{requestId:room.prompt.requestId});}
      if(intent==='dismiss'){e.preventDefault();setPreview(null);setZone(null);}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[room,pending,connected,zone,coinDone]);
  const state=room?.snapshot,you=state?.players.find(p=>p.id===room?.playerId),opponent=state?.players.find(p=>p.id!==room?.playerId);
  const coinVisible=!!room&&state?.gameNumber===1&&state.coinChoicePending===true;
  const coinPending=coinVisible&&coinDone!==room?.matchId;
  const finishCoin=useCallback(()=>setCoinDone(room?.matchId??null),[room?.matchId]);
  const canSelect=connected&&!pending&&!coinPending&&room?.prompt?.kind==='input';
  const cardDrag=useCardDrag(!!canSelect,selectCard);
  function cardNode(card:ArenaCard,style?:CSSProperties){return <button key={card.stackId??card.id} className={`forge-card ${cardDrag.drag?.card.id===card.id?'is-drag-origin':''} ${card.tapped?'is-tapped':''} ${card.actionable&&canSelect?'is-actionable':''} ${state?.combat?.some(a=>a.attackerId===card.id)?'is-attacking':''} ${state?.combat?.some(a=>a.blockerIds.includes(card.id))?'is-blocking':''}`} style={style} data-card-id={card.id} title={card.name} draggable={false} onPointerDown={e=>{if(you?.hand.some(c=>c.id===card.id)){cardDrag.begin(e,card);setPreview(null);}}} onMouseEnter={()=>{if(!cardDrag.drag)setPreview(card);}} onMouseLeave={()=>setPreview(null)} onFocus={()=>setPreview(card)} onBlur={()=>setPreview(null)} onClick={()=>{if(!cardDrag.consumeClick())selectCard(card);}}>
    <img src={imageUrl(card)} alt={card.name} draggable={false}/><span className="forge-card-name">{card.name}</span>{card.power!==undefined&&<strong className="forge-pt">{card.power}/{card.toughness}</strong>}
  </button>;}
  const prompt=room?.prompt?{...room.prompt,okLabel:label(room.prompt.okLabel??''),cancelLabel:label(room.prompt.cancelLabel??'')}:undefined;
  return <main className="forge-app">
    <ArenaAtmosphere/>
    {cardDrag.drag&&<div className={`forge-drag-card ${cardDrag.drag.returning?'returning':''}`} aria-hidden="true" style={{left:cardDrag.drag.originX,top:cardDrag.drag.originY,translate:`${cardDrag.drag.x-cardDrag.drag.startX}px ${cardDrag.drag.y-cardDrag.drag.startY}px`,width:cardDrag.drag.width,height:cardDrag.drag.height}}><img src={imageUrl(cardDrag.drag.card)} alt=""/><i/></div>}
    {!room?<ArenaLobby connected={connected} name={name} onName={setName} deck={deck} onDeck={setDeck} bestOf={bestOf} onBestOf={setBestOf} endpoint={endpoint} defaultEndpoint={defaultEndpoint} onConnect={connectServer} rooms={rooms} onRefresh={()=>send({type:"listRooms"})} onCreate={()=>send({type:"create",name,deckText:deck,bestOf})} onJoin={code=>send({type:"join",code,name,deckText:deck})} error={error}/>:<>
      <header className="forge-top"><span>对局 {room.code}</span><span>{connected?'已连接':'正在重新连接…'}</span><button disabled={!connected} onClick={()=>send({type:'leave'})}>返回大厅</button></header>
      {state?.bestOf===3&&<div className="forge-match-score">BO3 · 第 {state.gameNumber} 局 · {you?.name} {state.scores?.[room.seat]??0} : {state.scores?.[1-room.seat]??0} {opponent?.name}{state.matchOver?' · 比赛结束':''}</div>}
      {coinVisible&&<CoinToss winner={state!.players[state!.coinWinnerSeat!]?.name??'牌手'} onComplete={finishCoin}>{room.seat===state!.coinWinnerSeat?<fieldset disabled={coinPending||pending||!connected}><p>{pending?'正在确认选择…':'选择先手或后手'}</p><button disabled={!prompt?.okEnabled} onClick={()=>prompt&&command('ok',{requestId:prompt.requestId})}>{prompt?.okLabel||'先手'}</button><button disabled={!prompt?.cancelEnabled} onClick={()=>prompt&&command('cancel',{requestId:prompt.requestId})}>{prompt?.cancelLabel||'后手'}</button></fieldset>:<p>等待对手选择先后手</p>}</CoinToss>}
      {!state?<section className="forge-wait"><h1>{room.status==='waiting'?'等待对手':'正在准备对局'}</h1><p>房间码：{room.code}</p></section>:<>
        <section className="forge-board" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');const card=you?.hand.find(c=>c.id===id);if(card)selectCard(card);}}>
          <div className="forge-enemy-hand">{Array.from({length:opponent?.handCount??0},(_,i)=><img key={i} src="/mtg-card-back.png" alt="对手手牌" style={{transform:`rotate(${(i-((opponent?.handCount??1)-1)/2)*4}deg)`}}/>)}</div>
          {[opponent,you].map((p,index)=>p&&<section className={`forge-side ${index===0?'enemy':'self'}`} key={p.id}>
            <button data-player-id={p.id} className={`forge-avatar ${state.activePlayerId===p.id?'active':''}`} onClick={()=>room.prompt&&command('selectPlayer',{requestId:room.prompt.requestId,playerId:p.id})}><AvatarCrest/><span>{p.name}</span><strong>{p.life}</strong></button>
            <div className="forge-permanents">{p.battlefield.filter(c=>c.kind!=='land').map(c=>cardNode(c))}</div><div className="forge-lands">{p.battlefield.filter(c=>c.kind==='land').map(c=>cardNode(c))}</div>
            <aside className="forge-zones"><div className="forge-library"><img src="/mtg-card-back.png" alt="牌库"/><span>{p.libraryCount}</span></div>{(['graveyard','exile'] as const).map(z=><button key={z} onClick={()=>setZone({title:z==='graveyard'?'坟场':'放逐区',cards:p[z]})}>{z==='graveyard'?'坟场':'放逐'} <b>{p[z].length}</b></button>)}</aside>
          </section>)}
          <div className="forge-phase">{state.gameOver?'对局结束':phaseLabel(state.phase)}</div>
          <StackPanel key={room.matchId} cards={state.stack} history={room.recentStackEvents??[]} players={state.players} onInspect={setPreview} onDismiss={()=>setPreview(null)} onSelect={card=>card.actionable?selectCard(card):setPreview(card)}/>
          <CombatLines combat={state.combat??[]}/>
        </section>
        <div className="forge-hand" aria-label="手牌">{you?.hand.map((c,i)=>{const offset=i-(you.hand.length-1)/2;return cardNode(c,{'--fan-angle':`${Math.max(-13,Math.min(13,offset*3))}deg`,'--fan-y':`${Math.abs(offset)**1.6*2}px`,zIndex:i} as CSSProperties);})}</div>
        <fieldset className={`forge-input ${prompt?.kind==='sideboard'?'forge-sideboard-input':''}`} disabled={!connected||pending||coinPending||room.status==='failed'||state.gameOver}><ForgeControls prompt={prompt} fullControl={room.fullControl} onControl={fullControl=>command('control',{fullControl})} onDecision={decision=>command(decision.type,{...decision})}/></fieldset>
        <SemanticCanvas key={`${room.matchId}:${animationBaseline.epoch}`} events={events} ownPlayerId={room.playerId} baseline={animationBaseline.sequence}/>
        {preview&&!zone&&!cardDrag.drag&&<div className="forge-preview"><img src={imageUrl(preview)} alt={preview.name}/></div>}
        {zone&&<div className="forge-modal" onClick={()=>setZone(null)}><section onClick={e=>e.stopPropagation()}><header><h2>{zone.title}</h2><button onClick={()=>setZone(null)}>关闭</button></header><div>{zone.cards.map(c=>cardNode(c))}</div></section></div>}
      </>}
    </>}
    {(error||room?.error)&&<div className="forge-error" role="alert">{room?.error||error}<button onClick={()=>setError('')}>×</button></div>}
  </main>;
}
