import type {ForgePrompt} from '../shared/forgeTypes';

type KeyboardContext={key:string;code:string;repeat:boolean;composing:boolean;modified:boolean;interactive:boolean;overlay:boolean;ready:boolean;prompt?:ForgePrompt};

export function arenaKeyboardIntent(context:KeyboardContext):'confirm'|'dismiss'|null{
  if(context.repeat||context.composing||context.modified)return null;
  if(context.key==='Escape')return 'dismiss';
  if(context.code!=='Space'||context.interactive||context.overlay||!context.ready)return null;
  return context.prompt?.kind==='input'&&context.prompt.okEnabled?'confirm':null;
}
