import test from 'node:test';
import assert from 'node:assert/strict';
import {AnimationTimeline} from '../src/client/animationTimeline';
const event=(sequence:number,kind='cast')=>({sequence,kind,data:{cardId:'visible-card'}});

test('semantic animation rejects duplicate and stale events and keeps effects parallel',()=>{
  const timeline=new AnimationTimeline(5);
  timeline.push([event(4),event(6),event(7,'tap')],0);
  timeline.push([event(6),event(7,'tap')],50);
  assert.deepEqual(timeline.frame(100).map(cue=>cue.event.sequence),[6,7]);
  assert.deepEqual(timeline.frame(300).map(cue=>cue.event.sequence),[6]);
  assert.equal(timeline.frame(500).length,0);
});
test('reduced motion consume events without replaying them later',()=>{
  const timeline=new AnimationTimeline();timeline.push([event(1)],0);timeline.setReduced(true);timeline.setReduced(false);timeline.push([event(1)],10);assert.equal(timeline.frame(10).length,0);
  timeline.setReduced(true);timeline.push([event(2)],20);timeline.setReduced(false);timeline.push([event(2),event(3)],30);assert.deepEqual(timeline.frame(30).map(cue=>cue.event.sequence),[3]);
});
test('animation bursts remain bounded and delayed frames settle immediately',()=>{
  const timeline=new AnimationTimeline(0,3);timeline.push([1,2,3,4,5].map(n=>event(n)),0);assert.deepEqual(timeline.frame(0).map(cue=>cue.event.sequence),[3,4,5]);assert.equal(timeline.frame(60000).length,0);
});
