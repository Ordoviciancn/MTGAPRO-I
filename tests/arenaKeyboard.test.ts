import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaKeyboardIntent} from '../src/client/arenaKeyboard';
import type {ForgePrompt} from '../src/shared/forgeTypes';

const prompt:ForgePrompt={seat:0,requestId:'priority-1',kind:'input',message:'Priority',okEnabled:true};
const base={key:' ',code:'Space',repeat:false,composing:false,modified:false,interactive:false,overlay:false,ready:true,prompt};

test('space confirms only an available engine input on the unobstructed table',()=>{
  assert.equal(arenaKeyboardIntent(base),'confirm');
  for(const blocked of [{interactive:true},{overlay:true},{ready:false},{repeat:true},{composing:true},{modified:true}])
    assert.equal(arenaKeyboardIntent({...base,...blocked}),null);
  for(const kind of ['number','choice','order','unsupported'] as const)
    assert.equal(arenaKeyboardIntent({...base,prompt:{...prompt,kind}}),null);
  assert.equal(arenaKeyboardIntent({...base,prompt:{...prompt,okEnabled:false}}),null);
  assert.equal(arenaKeyboardIntent({...base,prompt:undefined}),null);
});

test('escape dismisses inspection without answering an engine choice',()=>{
  assert.equal(arenaKeyboardIntent({...base,key:'Escape',code:'Escape',overlay:true,interactive:true,ready:false,prompt:{...prompt,kind:'number'}}),'dismiss');
  assert.equal(arenaKeyboardIntent({...base,key:'Enter',code:'Enter'}),null);
});
