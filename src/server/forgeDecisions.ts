import type { ForgeDecision, ForgePrompt } from '../shared/forgeTypes';

export function validateForgeDecision(prompt: ForgePrompt | undefined, decision: ForgeDecision): boolean {
  if (!prompt || prompt.kind === 'unsupported' || decision.requestId !== prompt.requestId) return false;
  if (decision.type === 'choice') {
    if(prompt.kind==='number')return Number.isSafeInteger(decision.value) && typeof decision.value==='number' && decision.value>=(prompt.min??0) && decision.value<=(prompt.max??0);
    if ((prompt.kind !== 'choice' && prompt.kind!=='order' && prompt.kind!=='sideboard') || !prompt.options) return false;
    const values = Array.isArray(decision.value) ? decision.value : [decision.value];
    if (values.length < (prompt.min ?? 1) || values.length > (prompt.max ?? 1) || new Set(values).size !== values.length) return false;
    return values.every(value => Number.isInteger(value) && prompt.options!.some(option => option.value === value));
  }
  if (prompt.kind !== 'input') return false;
  if (decision.type === 'ok') return prompt.okEnabled === true;
  if (decision.type === 'cancel') return prompt.cancelEnabled === true;
  if (decision.type === 'selectCard') return Number.isSafeInteger(decision.cardId) && decision.cardId! >= 0;
  if (decision.type === 'selectPlayer') return Number.isSafeInteger(decision.playerId) && decision.playerId! >= 0;
  return false;
}
