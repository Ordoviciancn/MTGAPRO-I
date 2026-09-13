import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDeck,loadDeckLibrary,parseDeckText,parseLibrary,saveDeckLibrary,type DeckLibrary} from '../src/client/deckLibrary';
const library:DeckLibrary={version:1,decks:[{id:'deck-1',name:'红色牌组',text:'20 Mountain\n4 Lightning Bolt\n\nSideboard\n2 Pyroblast',updatedAt:'2026-09-12T00:00:00.000Z'}]};
test('deck import preserves main/side identities and round trips merged counts',()=>{
  const rows=parseDeckText('Deck\n2 Mountain\n2 Mountain\nSB: 1 Mountain\nSideboard\n2 Pyroblast');
  assert.deepEqual(rows,[{name:'Mountain',count:4,sideboard:false},{name:'Mountain',count:1,sideboard:true},{name:'Pyroblast',count:2,sideboard:true}]);
  assert.deepEqual(parseDeckText(formatDeck(rows)),rows);
  for(const invalid of ['0 Mountain','251 Mountain','250 Mountain\n1 Island','Mountain','-1 Mountain','Sideboard\n16 Island'])assert.throws(()=>parseDeckText(invalid));
  assert.equal(parseDeckText('250 Mountain\nSideboard\n15 Island').length,2);
});
test('saved libraries reject corrupt schemas, duplicate IDs, quotas and unsupported versions',()=>{
  assert.deepEqual(parseLibrary(JSON.stringify(library)),library);
  for(const value of ['{',JSON.stringify({...library,version:2}),JSON.stringify({...library,decks:[library.decks[0],library.decks[0]]}),JSON.stringify({...library,decks:[{...library.decks[0],updatedAt:'bad'}]}),JSON.stringify({...library,decks:[{...library.decks[0],text:'999 Island'}]})])assert.throws(()=>parseLibrary(value));
  assert.throws(()=>parseLibrary(' '.repeat(512*1024+1)));
});
test('web save survives reload and failure never returns success or replaces stored data',async()=>{
  let raw:string|null=null;const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
  await saveDeckLibrary(library,storage);assert.deepEqual(await loadDeckLibrary(storage),library);
  await assert.rejects(saveDeckLibrary({...library,version:2} as unknown as DeckLibrary,storage));
  assert.deepEqual(await loadDeckLibrary(storage),library);
  await assert.rejects(saveDeckLibrary(library,{...storage,setItem:()=>{throw new Error('quota');}}),/quota/);
});
test('desktop library uses native persistence exclusively and surfaces invalid files',async()=>{
  let raw:string|null=null;const web={getItem:()=>{throw new Error('web must not be read');},setItem:()=>{throw new Error('web must not be written');}};
  const desktop={loadLibrary:async()=>raw,saveLibrary:async(value:string)=>{raw=value;}};
  assert.deepEqual(await loadDeckLibrary(web,desktop),{version:1,decks:[]});
  await saveDeckLibrary(library,web,desktop);assert.deepEqual(await loadDeckLibrary(web,desktop),library);
  raw='broken';await assert.rejects(loadDeckLibrary(web,desktop));assert.equal(raw,'broken');
});
