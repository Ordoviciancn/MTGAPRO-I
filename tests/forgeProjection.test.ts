import test from 'node:test';
import assert from 'node:assert/strict';
import { ForgeProjection } from '../src/server/forgeProjection';

test('observer projections strip opposing hands and expire handles after concealment',()=>{
  const projector=new ForgeProjection(0,()=>['A','B']);
  const c={id:17,ownerId:0,name:'Mountain',kind:'land'};
  const p=(id:number)=>({id,name:'Player',life:20,hand:[{...c,id:17+id,ownerId:id}],handCount:1,libraryCount:59,battlefield:[],graveyard:[],exile:[]});
  const raw={type:'state',players:[p(0),p(1)],stack:[],phase:'MAIN1',activePlayerId:0};
  const first=projector.snapshot(raw),id=first.players[0].hand[0].id;
  assert.equal(first.players[1].hand.length,0);
  assert.equal(projector.resolveCard(id),17);
  assert.equal(first.players[0].id,'A');
  assert.equal(projector.snapshot(raw).players[0].hand[0].id,id);
  projector.snapshot({...raw,players:[{...p(0),hand:[]},p(1)]});
  assert.equal(projector.resolveCard(id),undefined);
  assert.notEqual(projector.snapshot(raw).players[0].hand[0].id,id);
  const other=new ForgeProjection(1,()=>['A','B']);
  assert.notEqual(other.snapshot({...raw,players:[{...p(0),battlefield:[c]},p(1)]}).players[0].battlefield[0].id,id);
});

test('semantic projection allowlists public fields instead of serializing engine objects',()=>{
  const projector=new ForgeProjection(0,()=>['A','B']);
  const event=projector.event({type:'semantic',sequence:7,kind:'zone',data:{from:'Library',to:'Hand',secret:'Counterspell',internalId:42}});
  assert.deepEqual(event,{sequence:7,kind:'zone',data:{from:'Library',to:'Hand'}});
});

test('stack history projects public ability descriptions but strips concealed source text',()=>{
  const projector=new ForgeProjection(0,()=>['A','B']);
  const data={cardId:17,name:'Goblin Arsonist',ability:true,description:'Deal 1 damage to any target.',fizzled:false};
  const event=projector.event({type:'semantic',sequence:1,kind:'resolve',data});
  assert.equal(event.data.description,data.description);assert.equal(event.data.ability,true);
  for(const raw of [{description:'Secret card'},{cardId:17,name:'Face-down card',description:'Secret card'}]){
    assert.equal(projector.event({type:'semantic',sequence:2,kind:'cast',data:raw}).data.description,undefined);
  }
});

test('combat references resolve only to cards present in the observer projection',()=>{
  const projector=new ForgeProjection(0,()=>['A','B']);
  const p=(id:number)=>({id,name:'Player',life:20,hand:[],handCount:0,libraryCount:50,battlefield:[{id:id+10,ownerId:id,name:'Grizzly Bears',kind:'creature'}],graveyard:[],exile:[]});
  const view=projector.snapshot({type:'state',players:[p(0),p(1)],stack:[],phase:'COMBAT_DECLARE_BLOCKERS',activePlayerId:0,combat:[{attackerId:10,defenderPlayerId:1,blockerIds:[11,999]},{attackerId:998,blockerIds:[]}]});
  assert.deepEqual(view.combat,[{attackerId:view.players[0].battlefield[0].id,defenderPlayerId:'B',defenderCardId:undefined,blockerIds:[view.players[1].battlefield[0].id]}]);
});

test('spell animation targets expose only known observer references',()=>{
  const projector=new ForgeProjection(0,()=>['A','B']);
  const p=(id:number)=>({id,name:'Player',life:20,hand:[],handCount:0,libraryCount:50,battlefield:[{id:id+10,ownerId:id,name:'Grizzly Bears',kind:'creature'}],graveyard:[],exile:[]});
  const view=projector.snapshot({type:'state',players:[p(0),p(1)],stack:[],phase:'MAIN1',activePlayerId:0});
  const event=projector.event({type:'semantic',sequence:8,kind:'cast',data:{targetPlayerIds:[1,999],targetCardIds:[11,998]}});
  assert.deepEqual(event.data,{targetPlayerIds:['B'],targetCardIds:[view.players[1].battlefield[0].id]});
  assert.equal(projector.resolveCard('998'),undefined);
});

test('new Forge game expires old card references while retaining public match score',()=>{
  const projection=new ForgeProjection(0,()=>['A','B']);
  const player=(id:number)=>({id,name:'Player',life:20,hand:[{id:10+id,ownerId:id,name:'Mountain',kind:'land'}],handCount:1,libraryCount:59,battlefield:[],graveyard:[],exile:[]});
  const raw={type:'state',players:[player(0),player(1)],stack:[],phase:'MAIN1',activePlayerId:0,gameNumber:1,bestOf:3,scores:[0,0],coinWinnerSeat:1};
  const first=projection.snapshot(raw),old=first.players[0].hand[0].id;
  const second=projection.snapshot({...raw,gameNumber:2,scores:[0,1]});
  assert.equal(projection.resolveCard(old),undefined);
  assert.notEqual(second.players[0].hand[0].id,old);
  assert.deepEqual(second.scores,[0,1]);assert.equal(second.coinWinnerSeat,1);assert.equal(second.players[1].hand.length,0);
});
