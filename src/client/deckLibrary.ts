export interface SavedDeck {id:string;name:string;text:string;updatedAt:string}
export interface DeckLibrary {version:1;decks:SavedDeck[]}
export interface DeckRow {name:string;count:number;sideboard:boolean}
export interface LibraryStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface DesktopLibrary {loadLibrary():Promise<string|null>;saveLibrary(json:string):Promise<void>;tunnelStatus?():Promise<import('./TunnelPanel').TunnelState>;startTunnel?():Promise<import('./TunnelPanel').TunnelState>;stopTunnel?():Promise<import('./TunnelPanel').TunnelState>}
declare global {interface Window {mtgDesktop?:DesktopLibrary}}
const key='mtg-deck-library-v1';
const maxBytes=512*1024;

export function parseDeckText(text:string):DeckRow[]{
  if(text.length>16000)throw new Error('牌表不能超过 16000 个字符。');
  let sideboard=false;const rows:DeckRow[]=[];
  for(const [index,line] of text.split(/\r?\n/).entries()){
    const value=line.trim();if(!value)continue;
    if(/^(Sideboard|备牌)\s*:?$/i.test(value)){sideboard=true;continue;}
    if(/^(Deck|Mainboard|主牌)\s*:?$/i.test(value)){sideboard=false;continue;}
    const match=/^(SB:\s*)?(\d+)\s+(.+)$/i.exec(value);
    if(!match)throw new Error(`第 ${index+1} 行格式应为“数量 英文牌名”。`);
    const count=Number(match[2]),name=match[3].trim(),isSide=sideboard||Boolean(match[1]);
    if(!Number.isSafeInteger(count)||count<1||count>250||name.length>200)throw new Error(`第 ${index+1} 行数量或牌名过长。`);
    const existing=rows.find(row=>row.name===name&&row.sideboard===isSide);
    if(existing)existing.count+=count;else rows.push({name,count,sideboard:isSide});
  }
  if(rows.filter(row=>!row.sideboard).reduce((total,row)=>total+row.count,0)>250)throw new Error('主牌最多 250 张。');
  if(rows.filter(row=>row.sideboard).reduce((total,row)=>total+row.count,0)>15)throw new Error('备牌最多 15 张。');
  return rows;
}
export function formatDeck(rows:DeckRow[]):string{
  const section=(sideboard:boolean)=>rows.filter(row=>row.sideboard===sideboard).map(row=>`${row.count} ${row.name}`).join('\n');
  return section(false)+(rows.some(row=>row.sideboard)?`\n\nSideboard\n${section(true)}`:'');
}
export function parseLibrary(raw:string):DeckLibrary{
  if(new TextEncoder().encode(raw).length>maxBytes)throw new Error('牌组库超过 512 KiB 限制。');
  let data:unknown;try{data=JSON.parse(raw);}catch{throw new Error('牌组库格式损坏，原有数据未覆盖。');}
  if(!data||typeof data!=='object'||(data as DeckLibrary).version!==1||!Array.isArray((data as DeckLibrary).decks))throw new Error('无法识别牌组库版本。');
  const decks=(data as DeckLibrary).decks;if(decks.length>60)throw new Error('最多保存 60 套牌组。');
  const ids=new Set<string>();
  for(const deck of decks){
    if(!deck||typeof deck.id!=='string'||!deck.id||deck.id.length>100||ids.has(deck.id)||typeof deck.name!=='string'||!deck.name.trim()||deck.name.length>80||typeof deck.text!=='string'||typeof deck.updatedAt!=='string'||!Number.isFinite(Date.parse(deck.updatedAt)))throw new Error('牌组库含有无效或重复的牌组记录。');
    ids.add(deck.id);parseDeckText(deck.text);
  }
  return {version:1,decks:decks.map(({id,name,text,updatedAt})=>({id,name,text,updatedAt}))};
}
export async function loadDeckLibrary(storage:LibraryStorage,desktop?:DesktopLibrary):Promise<DeckLibrary>{
  const raw=desktop?await desktop.loadLibrary():storage.getItem(key);
  return raw===null?{version:1,decks:[]}:parseLibrary(raw);
}
export async function saveDeckLibrary(library:DeckLibrary,storage:LibraryStorage,desktop?:DesktopLibrary):Promise<void>{
  const raw=JSON.stringify(parseLibrary(JSON.stringify(library)));
  if(desktop)await desktop.saveLibrary(raw);else storage.setItem(key,raw);
}
