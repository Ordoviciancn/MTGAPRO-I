export type ChineseCard={name:string;zhName:string;text:string;image?:string;source:string;url:string};
type RawCard={id?:string;name?:string;face_name?:string;atomic_official_name?:string;atomic_translated_name?:string;atomic_translated_text?:string;atomic_text_translated_from?:string;zhs_name?:string;zhs_face_name?:string;zhs_text?:string;zhs_image_uris?:{normal?:string};other_faces?:RawCard[]};
// 牌表里连体牌分隔符写法不一（" // "、" / "、全角），统一归一后再比较。
const normalizeName=(value?:string)=>value?value.replace(/／/g,' / ').toLowerCase().replace(/\s*\/{1,2}\s*/g,' // ').replace(/\s+/g,' ').trim():'';
export function chineseCard(name:string,items:RawCard[]):ChineseCard|undefined{
  const wanted=normalizeName(name);if(!wanted)return;
  const all=items.flatMap(card=>[card,...(card.other_faces??[])]);
  const fullOf=(card:RawCard)=>normalizeName(card.name),faceOf=(card:RawCard)=>normalizeName(card.face_name);
  // 首选整名完全一致的卡，避免连体牌的某个面（如“兴战尊贤 // 闪电击”的闪电击面）抢走独立卡的身份。
  const full=all.find(card=>fullOf(card)&&fullOf(card)===wanted);
  if(full)return toChinese(name,full,false);
  const face=all.find(card=>faceOf(card)&&faceOf(card)===wanted);
  return face?toChinese(name,face,true):undefined;
}
function toChinese(name:string,card:RawCard,faceOnly=false):ChineseCard{
  const image=card.zhs_image_uris?.normal;
  // 仅命中面名时不采用连体牌的印刷卡图（其正面通常是另一张牌），回退到 Scryfall 单面英文图。
  const safeImage=!faceOnly&&image&&/^https:\/\/images\.mtgch\.com\//.test(image)?image:undefined;
  return {name,zhName:card.atomic_official_name||card.zhs_face_name||card.zhs_name||card.atomic_translated_name||name,
    text:(card.atomic_translated_text||card.zhs_text||'').replaceAll('\\n','\n'),image:safeImage,
    source:card.atomic_translated_text?`大学院废墟 · ${card.atomic_text_translated_from||'规则翻译'}`:'大学院废墟 · 中文印刷文本',
    url:card.id?`https://mtgch.com/card/${encodeURIComponent(card.id)}/`:'https://mtgch.com/'};
}
export function canLookup(name?:string,hidden=false){return !hidden&&!!name&&name!=='Face-down card'&&name.length<=200;}
