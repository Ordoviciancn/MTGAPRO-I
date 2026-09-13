import type { Command, CommandReceipt } from '../shared/matchProtocol';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',') + '}';
}

// Keep receipts for the entire match: eviction would permit old commands to execute twice.
export class CommandLedger {
  private tail: Promise<unknown> = Promise.resolve();
  private receipts = new Map<string, {fingerprint:string;receipt:CommandReceipt}>();
  private uncertain = false;
  constructor(private matchId:string,private limit=10000) {}

  submit(command:Command, authenticatedPlayerId:string, revision:()=>number, execute:(command:Command)=>Promise<CommandReceipt>):Promise<CommandReceipt> {
    const snapshot = structuredClone(command);
    const result = this.tail.then(async()=>{
      const reject = (code:CommandReceipt['code'],status:CommandReceipt['status']='rejected'):CommandReceipt=>({commandId:snapshot.commandId,revision:revision(),status,code});
      if(snapshot.matchId!==this.matchId || snapshot.playerId!==authenticatedPlayerId) return reject('identity');
      if(snapshot.protocolVersion!==1 || typeof snapshot.commandId!=='string' || !snapshot.commandId || snapshot.commandId.length>128 || !Number.isSafeInteger(snapshot.expectedRevision) || snapshot.expectedRevision<0) return reject('protocol');
      const key=JSON.stringify([authenticatedPlayerId,snapshot.commandId]);
      const fingerprint=canonical(snapshot);
      const previous=this.receipts.get(key);
      if(previous) return previous.fingerprint===fingerprint?structuredClone(previous.receipt):reject('conflict');
      if(this.uncertain) return reject('engine','resync');
      if(this.receipts.size>=this.limit) return reject('capacity');
      let receipt:CommandReceipt;
      if(snapshot.expectedRevision!==revision()) receipt=reject('expired','resync');
      else {
        try { receipt=await execute(snapshot); }
        catch { this.uncertain=true; receipt=reject('engine','resync'); }
      }
      this.receipts.set(key,{fingerprint,receipt:structuredClone(receipt)});
      return receipt;
    });
    this.tail=result.catch(()=>undefined);
    return result;
  }
}
