import test from 'node:test';
import assert from 'node:assert/strict';
import { validateForgeDecision } from '../src/server/forgeDecisions';
import type { ForgePrompt } from '../src/shared/forgeTypes';

const prompt: ForgePrompt = {seat:0,requestId:'r1',kind:'input',message:'Priority',okEnabled:true,cancelEnabled:false};
test('only current engine prompts accept enabled priority decisions',()=>{
  assert.equal(validateForgeDecision(prompt,{type:'ok',requestId:'r1'}),true);
  assert.equal(validateForgeDecision(prompt,{type:'ok',requestId:'old'}),false);
  assert.equal(validateForgeDecision(prompt,{type:'cancel',requestId:'r1'}),false);
  assert.equal(validateForgeDecision(undefined,{type:'ok',requestId:'r1'}),false);
  assert.equal(validateForgeDecision({...prompt,kind:'unsupported'},{type:'ok',requestId:'r1'}),false);
});
test('mandatory choices cannot be bypassed by priority confirmation',()=>{
  const choice: ForgePrompt={...prompt,kind:'choice',options:[{value:0,label:'A'},{value:1,label:'B'}],min:1,max:2};
  assert.equal(validateForgeDecision(choice,{type:'ok',requestId:'r1'}),false);
  assert.equal(validateForgeDecision(choice,{type:'choice',requestId:'r1',value:[]}),false);
  assert.equal(validateForgeDecision(choice,{type:'choice',requestId:'r1',value:[0,0]}),false);
  assert.equal(validateForgeDecision(choice,{type:'choice',requestId:'r1',value:[2]}),false);
  assert.equal(validateForgeDecision(choice,{type:'choice',requestId:'r1',value:[0,1]}),true);
});

test('numeric choices require a bounded integer and cannot be passed as priority',()=>{
  const numeric:ForgePrompt={seat:0,requestId:'x',kind:'number',message:'Choose X',min:0,max:2147483647};
  assert.equal(validateForgeDecision(numeric,{type:'choice',requestId:'x',value:3}),true);
  for(const value of [-1,1.5,2147483648,NaN,Infinity,[1]])assert.equal(validateForgeDecision(numeric,{type:'choice',requestId:'x',value}),false);
  assert.equal(validateForgeDecision(numeric,{type:'ok',requestId:'x'}),false);
  assert.equal(validateForgeDecision(numeric,{type:'choice',requestId:'old',value:1}),false);
});

test('ordered choices require the complete unique permutation when all entries are mandatory',()=>{
  const order:ForgePrompt={seat:0,requestId:'order',kind:'order',message:'Order top cards',min:2,max:2,options:[{value:0,label:'A'},{value:1,label:'B'}]};
  assert.equal(validateForgeDecision(order,{type:'choice',requestId:'order',value:[1,0]}),true);
  for(const value of [[0],[1,1],[0,1,2]])assert.equal(validateForgeDecision(order,{type:'choice',requestId:'order',value}),false);
});

test('sideboarding preserves physical copies and rejects invented or undersized main decks',()=>{
  const sideboard:ForgePrompt={seat:0,requestId:'side',kind:'sideboard',message:'Sideboard',initialMainSize:2,min:2,max:3,options:[{value:0,label:'Mountain'},{value:1,label:'Mountain'},{value:2,label:'Island'}]};
  assert.equal(validateForgeDecision(sideboard,{type:'choice',requestId:'side',value:[0,2]}),true);
  for(const value of [[0],[0,0],[0,3]])assert.equal(validateForgeDecision(sideboard,{type:'choice',requestId:'side',value}),false);
  assert.equal(validateForgeDecision(sideboard,{type:'ok',requestId:'side'}),false);
});
