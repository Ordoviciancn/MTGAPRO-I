import { randomUUID } from 'node:crypto';
import type { ArenaCard, ArenaCombat, ArenaEvent, ArenaSnapshot } from '../shared/arenaProtocol';
import type { ForgeMessage } from './forgeProcess';

type RawCard = {id:number;ownerId:number;controllerId?:number;name:string;kind:string;tapped?:boolean;actionable?:boolean;power?:number;toughness?:number;stackId?:number;ability?:boolean;description?:string;counters?:Record<string,number>;token?:boolean;attachedTo?:number};
type RawPlayer = {id:number;name:string;life:number;libraryCount:number;handCount:number;hand:RawCard[];battlefield:RawCard[];graveyard:RawCard[];exile:RawCard[];libraryTop?:RawCard|null};

// References belong to one observer. A card leaving their visible zones loses its handle.
export class ForgeProjection {
  private gameNumber=0;
  private handles=new Map<number,string>();
  private stackHandles=new Map<number,string>();
  private playerIds=new Map<number,string>();
  constructor(private seat:number,private identities:()=>string[]) {}
  resolveCard(handle:unknown):number|undefined {return [...this.handles].find(([,id])=>id===handle)?.[0];}
  resolvePlayer(handle:unknown):number|undefined {return [...this.playerIds].find(([,id])=>id===handle)?.[0];}
  private handle(id:number):string {let result=this.handles.get(id);if(!result){result=randomUUID();this.handles.set(id,result);}return result;}
  snapshot(message:ForgeMessage):ArenaSnapshot {
    if(Number(message.gameNumber??0)!==this.gameNumber){this.gameNumber=Number(message.gameNumber??0);this.handles.clear();this.stackHandles.clear();this.playerIds.clear();}
    const players=message.players as RawPlayer[];
    if(!Array.isArray(players)||players.length!==2)throw new Error('Invalid Forge player view.');
    players.forEach((p,i)=>this.playerIds.set(p.id,this.identities()[i]));
    const seen=new Set<number>(),stackSeen=new Set<number>();
    const card=(c:RawCard):ArenaCard=>{
      seen.add(c.id);
      const out:ArenaCard={id:this.handle(c.id),name:c.name,ownerId:this.playerIds.get(c.ownerId)!,controllerId:this.playerIds.get(c.controllerId??c.ownerId)!,kind:c.kind,tapped:c.tapped===true,hidden:c.name==='Face-down card',actionable:c.actionable===true};
      // 指示物计数是公开信息，牌面朝下也照常投影；token 标记仅在牌面可见时透传。
      // 佩戴/附魔目标是公开引用，映射到宿主卡的观察者句柄供客户端叠卡。
      if(typeof c.attachedTo==='number')out.attachedTo=this.handle(c.attachedTo);
      if(c.counters){const counters:Record<string,number>={};for(const [type,count] of Object.entries(c.counters)){const value=Number(count);if(Number.isFinite(value)&&value>0)counters[type]=value;}if(Object.keys(counters).length>0)out.counters=counters;}
      if(!out.hidden){out.power=c.power;out.toughness=c.toughness;if(typeof c.description==='string')out.description=c.description.slice(0,2000);if(c.token)out.token=true;}
      if(c.stackId!==undefined){stackSeen.add(c.stackId);if(!this.stackHandles.has(c.stackId))this.stackHandles.set(c.stackId,randomUUID());out.stackId=this.stackHandles.get(c.stackId);out.ability=c.ability;}
      return out;
    };
    const projected=players.map((p,i)=>({id:this.playerIds.get(p.id)!,name:p.name,life:p.life,libraryCount:p.libraryCount,handCount:p.handCount,hand:i===this.seat?p.hand.map(card):[],battlefield:p.battlefield.map(card),graveyard:p.graveyard.map(card),exile:p.exile.map(card),libraryTop:p.libraryTop?card(p.libraryTop):null}));
    const stack=(message.stack as RawCard[]).map(card);
    for(const id of this.handles.keys())if(!seen.has(id))this.handles.delete(id);
    for(const id of this.stackHandles.keys())if(!stackSeen.has(id))this.stackHandles.delete(id);
    const combat:ArenaCombat[]=[];
    for(const raw of (message.combat??[]) as {attackerId:number;blockerIds:number[];defenderPlayerId?:number;defenderCardId?:number}[]){
      const attackerId=this.handles.get(raw.attackerId);if(!attackerId)continue;
      combat.push({attackerId,blockerIds:raw.blockerIds.map(id=>this.handles.get(id)).filter((id):id is string=>!!id),defenderPlayerId:this.playerIds.get(raw.defenderPlayerId!),defenderCardId:this.handles.get(raw.defenderCardId!)});
    }
    return {players:projected,stack,combat,phase:String(message.phase),activePlayerId:this.playerIds.get(Number(message.activePlayerId))??null,gameOver:message.gameOver===true,winnerPlayerIds:Array.isArray(message.winnerPlayerIds)?message.winnerPlayerIds.map(id=>this.playerIds.get(id)).filter((id):id is string=>!!id):undefined,lastEventSequence:Number(message.lastEventSequence??0),gameNumber:Number(message.gameNumber??1),bestOf:message.bestOf===3?3:1,scores:Array.isArray(message.scores)?message.scores.map(Number):[0,0],matchOver:message.matchOver===true};
  }
  event(message:ForgeMessage):ArenaEvent {
    const raw=message.data as Record<string,unknown>,data:ArenaEvent['data']={};
    if(typeof raw.playerId==='number')data.playerId=this.playerIds.get(raw.playerId);
    if(typeof raw.cardId==='number' && typeof raw.name==='string'){data.cardId=this.handle(raw.cardId);data.name=raw.name;}
    if(data.name&&data.name!=='Face-down card'&&typeof raw.description==='string')data.description=raw.description.slice(0,2000);
    if(typeof raw.ability==='boolean')data.ability=raw.ability;
    if(Array.isArray(raw.winnerPlayerIds))data.winnerPlayerIds=raw.winnerPlayerIds.map(id=>this.playerIds.get(id)).filter((id):id is string=>!!id);
    if(typeof raw.gameNumber==='number')data.gameNumber=raw.gameNumber;
    if(Array.isArray(raw.combat))data.combat=raw.combat.flatMap(attack=>{const attackerId=this.handles.get(attack.attackerId);return attackerId?[{attackerId,blockerIds:(attack.blockerIds??[]).map((id:number)=>this.handles.get(id)).filter((id:unknown):id is string=>typeof id==='string'),defenderPlayerId:this.playerIds.get(attack.defenderPlayerId),defenderCardId:this.handles.get(attack.defenderCardId)}]:[];});
    for(const key of ['from','to','phase'] as const)if(typeof raw[key]==='string')data[key]=raw[key];
    for(const key of ['before','after','amount'] as const)if(typeof raw[key]==='number')data[key]=raw[key];
    if(Array.isArray(raw.targetPlayerIds))data.targetPlayerIds=raw.targetPlayerIds.map(id=>this.playerIds.get(id)).filter((id):id is string=>!!id);
    if(Array.isArray(raw.targetCardIds))data.targetCardIds=raw.targetCardIds.map(id=>this.handles.get(id)).filter((id):id is string=>!!id);
    for(const key of ['tapped','fizzled'] as const)if(typeof raw[key]==='boolean')data[key]=raw[key];
    return {sequence:Number(message.sequence),kind:String(message.kind),data};
  }
}
