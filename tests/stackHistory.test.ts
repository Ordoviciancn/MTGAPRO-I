import test from 'node:test';
import assert from 'node:assert/strict';
import {appendStackEvent} from '../src/shared/stackHistory';
import type {ArenaEvent} from '../src/shared/arenaProtocol';

test('fast resolution preserves both release and result despite unrelated animation events',()=>{
  const cast:ArenaEvent={sequence:1,kind:'cast',data:{name:'Shock',ability:false}};
  const resolve:ArenaEvent={sequence:2,kind:'resolve',data:{name:'Shock',fizzled:false}};
  let history=appendStackEvent(appendStackEvent([],cast),resolve);
  for(let sequence=3;sequence<100;sequence++)history=appendStackEvent(history,{sequence,kind:'zone',data:{}});
  assert.deepEqual(history,[cast,resolve]);
  assert.deepEqual(appendStackEvent(history,cast),history);
});
test('ability and fizzled events remain distinct, history is bounded and private names are not invented',()=>{
  let history:ArenaEvent[]=[];
  for(let sequence=1;sequence<=20;sequence++)history=appendStackEvent(history,{sequence,kind:'resolve',data:{ability:true,fizzled:true}});
  assert.equal(history.length,16);assert.equal(history[0].sequence,5);
  assert.deepEqual(history[15].data,{ability:true,fizzled:true});
});
