export function connectionRecovery(now:number,lastMessageAt:number,sentAt?:number):'reconnect'|'retry'|'probe'|'wait'{
  if(now-lastMessageAt>=30000)return 'reconnect';
  // Retry only the original command: its server ledger receipt is idempotent.
  if(sentAt!==undefined&&now-sentAt>=20000)return 'retry';
  if(now-lastMessageAt>=10000)return 'probe';
  return 'wait';
}
