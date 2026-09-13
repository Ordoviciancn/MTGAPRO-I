import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { ArenaCredential, ArenaRoomView, ArenaServerMessage, ArenaSnapshot } from '../shared/arenaProtocol';
import type { ForgePrompt, ForgeDecision } from '../shared/forgeTypes';
import type { Command, CommandReceipt } from '../shared/matchProtocol';
import { CommandLedger } from './commandLedger';
import { ForgeProcess, type ForgeMessage } from './forgeProcess';
import { ForgeProjection } from './forgeProjection';
import { prepareForgeLaunch } from './forgeRuntime';
import { validateForgeDecision } from './forgeDecisions';
import {appendStackEvent} from '../shared/stackHistory';
import type {ArenaEvent} from '../shared/arenaProtocol';

type Member={id:string;token:string;name:string;deck:{name:string;count:number}[];sideboard:{name:string;count:number}[]};
const send=(socket:WebSocket,message:ArenaServerMessage)=>{
  if(socket.readyState!==WebSocket.OPEN)return;
  if(socket.bufferedAmount>2*1024*1024){socket.close(1013,'Client too slow');return;}
  socket.send(JSON.stringify(message));
};
function member(name:unknown,deckText:unknown):Member {
  if(typeof name!=='string'||!name.trim()||name.length>64||typeof deckText!=='string'||deckText.length>16000)throw new Error('姓名或牌表格式不正确。');
  const deck:{name:string;count:number}[]=[],sideboard:{name:string;count:number}[]=[];
  let inSideboard=false;
  for(const line of deckText.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)){
    if(/^(sideboard|备牌)\s*:?$/i.test(line)){inSideboard=true;continue;}
    if(/^(deck|mainboard|主牌)\s*:?$/i.test(line)){inSideboard=false;continue;}
    const row=line.match(/^(?:(SB):\s*)?(\d+)\s+(.+)$/i);
    if(!row)throw new Error('牌表每行格式为：数量 英文牌名；备牌前添加 Sideboard。');
    (inSideboard||row[1]?sideboard:deck).push({count:Number(row[2]),name:row[3].trim()});
  }
  const total=deck.reduce((sum,row)=>sum+row.count,0),sideTotal=sideboard.reduce((sum,row)=>sum+row.count,0);
  if(!deck.length||[...deck,...sideboard].some(row=>row.count<1||row.count>250)||total>250||sideTotal>15)throw new Error('主牌支持 1–250 张，备牌最多 15 张。');
  return {id:randomUUID(),token:randomBytes(32).toString('hex'),name:name.trim(),deck,sideboard};
}

class ForgeRoom {
  readonly id=randomUUID();
  readonly members:Member[]=[];
  readonly clients=new Map<WebSocket,number>();
  readonly ledger=new CommandLedger(this.id);
  readonly projections=[0,1].map(seat=>new ForgeProjection(seat,()=>this.members.map(p=>p.id)));
  readonly snapshots:(ArenaSnapshot|null)[]=[null,null];
  private readonly lastStates:(string|undefined)[]=[];
  readonly prompts:(ForgePrompt|null)[]=[null,null];
  readonly fullControl=[false,false];
  readonly recentStackEvents:ArenaEvent[][]=[[],[]];
  readonly pending=new Map<string,{resolve:(accepted:boolean)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  revision=0;
  status:ArenaRoomView['status']='waiting';
  error?:string;
  process?:ForgeProcess;
  cleanup?:()=>Promise<void>;
  expiry?:ReturnType<typeof setTimeout>;
  closed=false;
  constructor(readonly code:string,private root:string,private remove:()=>void,readonly bestOf:1|3=1){}
  view(seat:number):ArenaRoomView {return {matchId:this.id,code:this.code,playerId:this.members[seat].id,seat,revision:this.revision,status:this.status,snapshot:this.snapshots[seat],prompt:this.prompts[seat],fullControl:this.fullControl[seat],error:this.error,recentStackEvents:this.recentStackEvents[seat]};}
  broadcast(){for(const [ws,seat] of this.clients)send(ws,{type:'view',room:this.view(seat)});}
  bind(ws:WebSocket,seat:number){
    if(this.expiry){clearTimeout(this.expiry);this.expiry=undefined;}
    for(const [other,bound] of this.clients)if(bound===seat && other!==ws){this.clients.delete(other);other.close(4001,'Seat resumed elsewhere');}
    this.clients.set(ws,seat);
    const p=this.members[seat];send(ws,{type:'credential',credential:{code:this.code,playerId:p.id,token:p.token}});this.broadcast();
  }
  detach(ws:WebSocket){
    this.clients.delete(ws);
    if(this.closed)return;
    if(!this.clients.size&&!this.expiry){this.expiry=setTimeout(()=>void this.close(),300000);this.expiry.unref();}
  }
  async close(){
    if(this.closed)return;
    this.closed=true;this.remove();if(this.expiry)clearTimeout(this.expiry);
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('Room closed'));}
    this.pending.clear();
    await this.process?.stop();await this.cleanup?.();
  }
  leave(){
    for(const ws of this.clients.keys())send(ws,{type:'roomClosed',message:'玩家已退出，对局房间已关闭。'});
    return this.close();
  }
  fail(error:Error){
    if(this.closed)return;
    console.error('[Forge match]',this.id,error);
    this.status='failed';this.error='规则引擎已中断，对局已冻结。请检查服务端诊断。';this.prompts.fill(null);this.revision++;
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();this.broadcast();
    void this.process?.stop().then(()=>this.cleanup?.());
  }
  async start(){
    this.status='starting';this.revision++;this.broadcast();
    try {
      if(!process.env.JAVA_HOME)throw new Error('服务端尚未设置 JAVA_HOME。');
      const runtime=await prepareForgeLaunch(this.root,process.env.JAVA_HOME);this.cleanup=runtime.cleanup;
      if(this.closed){await runtime.cleanup();return;}
      this.process=new ForgeProcess(runtime.launch,message=>this.receive(message),error=>this.fail(error));
      await this.process.ready;
      if(this.closed)return;
      this.process.send({type:'init',bestOf:this.bestOf,players:this.members.map(p=>({name:p.name,deck:p.deck,sideboard:p.sideboard}))});
    }catch(error){this.fail(error as Error);}
  }
  private receive(message:ForgeMessage){
    if(this.closed)return;
    if(message.type==='ack'){
      const pending=this.pending.get(String(message.commandId));
      if(pending){clearTimeout(pending.timer);this.pending.delete(String(message.commandId));pending.resolve(message.accepted===true);}return;
    }
    if(message.type==='error'){this.fail(new Error(String(message.message)));return;}
    const seat=Number(message.seat);if(seat!==0&&seat!==1)return;
    if(message.type==='semantic'){
      const event=this.projections[seat].event(message);
      this.recentStackEvents[seat]=appendStackEvent(this.recentStackEvents[seat],event);
      for(const [ws,bound] of this.clients)if(bound===seat)send(ws,{type:'event',matchId:this.id,event});return;
    }
    if(message.type==='state'){
      const fingerprint=JSON.stringify(message);
      if(this.lastStates[seat]===fingerprint)return;
      this.lastStates[seat]=fingerprint;
      this.snapshots[seat]=this.projections[seat].snapshot(message);this.status='playing';
    }else if(message.type==='prompt'){
      if(!['input','choice','order','number','sideboard','unsupported'].includes(String(message.kind)))throw new Error('Invalid Forge prompt.');
      const clean=(text:unknown)=>String(text??'').replace(/\s*\(\d+\)/g,'');
      const prompt:ForgePrompt={seat,requestId:String(message.requestId),kind:message.kind as ForgePrompt['kind'],message:clean(message.message)};
      if(typeof message.inputType==='string')prompt.inputType=message.inputType;
      for(const key of ['okEnabled','cancelEnabled'] as const)prompt[key]=message[key]===true;
      for(const key of ['okLabel','cancelLabel'] as const)prompt[key]=clean(message[key]);
      if(Array.isArray(message.options))prompt.options=message.options.map(option=>({value:Number(option.value),label:clean(option.label)}));
      if(typeof message.initialMainSize==='number')prompt.initialMainSize=message.initialMainSize; if(typeof message.min==='number')prompt.min=message.min;if(typeof message.max==='number')prompt.max=message.max;
      if(JSON.stringify(this.prompts[seat])===JSON.stringify(prompt))return;
      this.prompts[seat]=prompt;
    }else if(message.type==='promptClosed')this.prompts[seat]=null;
    else if(message.type==='control')this.fullControl[seat]=message.fullControl===true;
    else return;
    this.revision++;this.broadcast();
  }
  async command(seat:number,command:Command):Promise<CommandReceipt>{
    return this.ledger.submit(command,this.members[seat].id,()=>this.revision,async command=>{
      const reject=():CommandReceipt=>({commandId:command.commandId,revision:this.revision,status:'rejected',code:'protocol'});
      if(this.status!=='playing'||this.snapshots[seat]?.matchOver||!this.process||!command.parameters||typeof command.parameters!=='object')return reject();
      const args=command.parameters;
      const engine:ForgeMessage={type:command.operation,seat,commandId:randomUUID()};
      const prompt=this.prompts[seat];
      if(command.operation==='concede'){if(this.snapshots[seat]?.gameOver||this.prompts.some(p=>p&&p.kind!=='input'))return reject();}else if(command.operation==='control'){
        if(typeof args.fullControl!=='boolean')return reject();engine.fullControl=args.fullControl;
      }else{
        const decision:ForgeDecision={type:command.operation as ForgeDecision['type'],requestId:String(args.requestId??'')};
        if(command.operation==='selectCard')decision.cardId=this.projections[seat].resolveCard(args.cardId);
        if(command.operation==='selectPlayer')decision.playerId=this.projections[seat].resolvePlayer(args.playerId);
        if(command.operation==='choice')decision.value=args.value as number|number[];
        if(!validateForgeDecision(prompt??undefined,decision))return reject();
        Object.assign(engine,decision);
      }
      const accepted=await new Promise<boolean>((resolve,reject)=>{
        const id=String(engine.commandId);
        const timer=setTimeout(()=>{this.pending.delete(id);const error=new Error('规则引擎未确认输入。');reject(error);this.fail(error);},15000);
        this.pending.set(id,{resolve,reject,timer});
        try{this.process!.send(engine);}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
      });
      if(accepted && command.operation!=='control' && this.prompts[seat]===prompt)this.prompts[seat]=null;
      this.revision++;this.broadcast();
      return {commandId:command.commandId,revision:this.revision,status:accepted?'accepted':'rejected',...(!accepted?{code:'expired' as const}:{})};
    });
  }
}

export function createForgeRooms(root:string){
  const rooms=new Map<string,ForgeRoom>();
  const connect=(ws:WebSocket)=>{
    let bound:{room:ForgeRoom;seat:number}|undefined;
    let inbox=Promise.resolve();
    let queued=0;
    ws.on('message',raw=>{
      if(ws.readyState!==WebSocket.OPEN)return;
      if(++queued>64){queued--;ws.close(1008,'Too many pending messages');return;}
      inbox=inbox.then(async()=>{
        if(ws.readyState!==WebSocket.OPEN)return;
        if(raw.toString().length>32768)throw new Error('消息超过大小限制。');
        const message=JSON.parse(raw.toString());
        if(message.type==='listRooms'){
          if(bound)throw new Error('当前连接已加入对局。');
          send(ws,{type:'rooms',rooms:[...rooms.values()].map(room=>({code:room.code,hostName:room.members[0].name,seats:room.members.length,bestOf:room.bestOf,status:room.status}))});
          return;
        }
        if(message.type==='create'||message.type==='join'){
          if(process.env.FORGE_REMOTE_CLIENT_ONLY==='1')throw new Error('当前是远程客户端模式，请先在大厅连接远程服务器。');
          if(bound)throw new Error('当前连接已加入对局。');
          const player=member(message.name,message.deckText);
          let room:ForgeRoom;
          if(message.type==='create'){
            if(rooms.size>=8)throw new Error('对局数量已达上限。');
            let code:string;do{code=randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(code));
            room=new ForgeRoom(code,root,()=>rooms.delete(code),message.bestOf===3?3:1);rooms.set(code,room);
          }else{
            const existing=rooms.get(String(message.code).trim().toUpperCase());
            if(!existing||existing.members.length!==1||existing.status!=='waiting')throw new Error('房间不存在或已满。');room=existing;
          }
          const seat=room.members.length;room.members.push(player);bound={room,seat};room.bind(ws,seat);
          if(room.members.length===2)void room.start();return;
        }
        if(message.type==='resume'){
          if(bound)throw new Error('当前连接已加入对局。');
          const credential=message.credential as ArenaCredential;
          const room=rooms.get(String(credential?.code));
          const seat=room?.members.findIndex(p=>p.id===credential.playerId&&p.token===credential.token)??-1;
          if(!room||seat<0)throw new Error('无法恢复座位：凭据无效或对局已结束。');
          bound={room,seat};room.bind(ws,seat);return;
        }
        if(!bound)throw new Error('请先创建或加入对局。');
        if(bound.room.clients.get(ws)!==bound.seat)throw new Error('此连接已失去座位。');
        if(message.type==='leave'){const room=bound.room;bound=undefined;await room.leave();return;}
        if(bound.room.closed)throw new Error('房间已关闭。');
        if(message.type==='resync'){send(ws,{type:'view',room:bound.room.view(bound.seat)});return;}
        if(message.type==='command'){
          const receipt=await bound.room.command(bound.seat,message.command);send(ws,{type:'receipt',receipt});
          if(receipt.status==='resync')send(ws,{type:'view',room:bound.room.view(bound.seat)});return;
        }
        throw new Error('不支持的消息。');
      }).catch(error=>send(ws,{type:'error',message:String((error as Error).message)})).finally(()=>{queued--;});
    });
    ws.on('close',()=>bound?.room.detach(ws));
  };
  return Object.assign(connect,{close:async()=>{await Promise.all([...rooms.values()].map(room=>room.close()));}});
}
