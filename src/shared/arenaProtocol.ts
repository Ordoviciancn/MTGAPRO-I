import type { Command, CommandReceipt } from './matchProtocol';
import type { ForgePrompt } from './forgeTypes';

export type ArenaCard = {id:string;name:string;ownerId:string;controllerId:string;kind:string;tapped:boolean;hidden:boolean;actionable:boolean;power?:number;toughness?:number;stackId?:string;ability?:boolean;description?:string;counters?:Record<string,number>;token?:boolean;attachedTo?:string};
export type ArenaPlayer = {id:string;name:string;life:number;libraryCount:number;handCount:number;hand:ArenaCard[];battlefield:ArenaCard[];graveyard:ArenaCard[];exile:ArenaCard[];libraryTop?:ArenaCard|null};
export type ArenaCombat = {attackerId:string;blockerIds:string[];defenderPlayerId?:string;defenderCardId?:string};
export type ArenaSnapshot = {players:ArenaPlayer[];stack:ArenaCard[];combat:ArenaCombat[];phase:string;activePlayerId:string|null;gameOver:boolean;winnerPlayerIds?:string[];lastEventSequence:number;gameNumber?:number;bestOf?:1|3;scores?:number[];matchOver?:boolean;};
export type ArenaEvent = {sequence:number;kind:string;data:{playerId?:string;cardId?:string;name?:string;description?:string;ability?:boolean;from?:string;to?:string;phase?:string;amount?:number;before?:number;after?:number;tapped?:boolean;fizzled?:boolean;targetPlayerIds?:string[];targetCardIds?:string[];combat?:ArenaCombat[];winnerPlayerIds?:string[];gameNumber?:number}};
export type ArenaRoomView = {matchId:string;code:string;playerId:string;seat:number;revision:number;status:'waiting'|'starting'|'playing'|'failed';snapshot:ArenaSnapshot|null;prompt:ForgePrompt|null;fullControl:boolean;error?:string;recentStackEvents?:ArenaEvent[]};
export type ArenaCredential = {code:string;playerId:string;token:string};
export type ArenaRoomListing = {code:string;hostName:string;seats:number;bestOf:1|3;status:ArenaRoomView['status']};
export type ArenaClientMessage =
 | {type:'leave'}
 | {type:'listRooms'}
 | {type:'create';name:string;deckText:string;bestOf?:1|3}
 | {type:'join';code:string;name:string;deckText:string}
 | {type:'resume';credential:ArenaCredential}
 | {type:'command';command:Command}
 | {type:'resync'};
export type ArenaServerMessage =
 | {type:'roomClosed';message:string}
 | {type:'rooms';rooms:ArenaRoomListing[]}
 | {type:'credential';credential:ArenaCredential}
 | {type:'view';room:ArenaRoomView}
 | {type:'event';matchId:string;event:ArenaEvent}
 | {type:'receipt';receipt:CommandReceipt}
 | {type:'error';message:string};
