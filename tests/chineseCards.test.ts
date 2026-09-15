import test from 'node:test';
import assert from 'node:assert/strict';
import {chineseCard,canLookup} from '../src/client/chineseCards';
test('Chinese lookup matches exact identities rather than the first search result',()=>{
 const card=chineseCard('Lightning Bolt',[{name:'Emeritus // Lightning Bolt',atomic_translated_name:'错误匹配'},{id:'bolt',name:'Lightning Bolt',atomic_official_name:'闪电击',atomic_translated_text:'造成3点伤害。',zhs_image_uris:{normal:'https://images.mtgch.com/zhs/bolt.webp'}}]);
 assert.equal(card?.zhName,'闪电击');assert.ok(card?.image);assert.equal(chineseCard('Missing',[]),undefined);
});
test('hidden names cannot request resources and external image hosts are rejected',()=>{
 assert.equal(canLookup('Secret Card',true),false);assert.equal(canLookup('Face-down card'),false);
 assert.equal(chineseCard('Shock',[{name:'Shock',zhs_image_uris:{normal:'http://localhost/private'}}])?.image,undefined);
});
test('split card full names match regardless of separator style',()=>{
 const items=[{name:'Fire // Ice',atomic_official_name:'火焰 // 冰锥',zhs_image_uris:{normal:'https://images.mtgch.com/fire.webp'}}];
 assert.equal(chineseCard('Fire // Ice',items)?.zhName,'火焰 // 冰锥');
 assert.equal(chineseCard('Fire / Ice',items)?.zhName,'火焰 // 冰锥');
 assert.equal(chineseCard('fire  //  ice',items)?.zhName,'火焰 // 冰锥');
});
test('single face queries match faces of multi-face cards without leaking the other face',()=>{
 const items=[{name:'Brazen Borrower // Petty Theft',other_faces:[{face_name:'Brazen Borrower',zhs_face_name:'厚颜借客',zhs_image_uris:{normal:'https://images.mtgch.com/borrower.webp'}}]}];
 const card=chineseCard('Brazen Borrower',items);
 assert.equal(card?.zhName,'厚颜借客');assert.equal(card?.image,undefined);
});
test('standalone cards win over faces of combined cards and never inherit their prints',()=>{
 const items=[
  {name:'Emeritus // Lightning Bolt',atomic_official_name:'兴战尊贤 // 闪电击',zhs_image_uris:{normal:'https://images.mtgch.com/emeritus.webp'},other_faces:[{face_name:'Emeritus',zhs_face_name:'兴战尊贤'},{face_name:'Lightning Bolt',zhs_face_name:'闪电击'}]},
  {id:'bolt',name:'Lightning Bolt',atomic_official_name:'闪电击',zhs_image_uris:{normal:'https://images.mtgch.com/bolt.webp'}}];
 const card=chineseCard('Lightning Bolt',items);
 assert.equal(card?.zhName,'闪电击');assert.equal(card?.image,'https://images.mtgch.com/bolt.webp');
});
