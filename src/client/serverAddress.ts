export function serverAddress(input:string,pageProtocol='http:'):string{
  const value=input.trim();if(!value)throw new Error('请输入服务器地址。');
  let url:URL;try{url=new URL(/^[a-z]+:\/\//i.test(value)?value:`http://${value}`);}catch{throw new Error('服务器地址格式不正确。');}
  if(!['http:','https:','ws:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!['/','/forge',''].includes(url.pathname))throw new Error('地址应为 http(s)://主机:端口，不包含密码或查询参数。');
  const secure=url.protocol==='https:'||url.protocol==='wss:';
  if(pageProtocol==='https:'&&!secure)throw new Error('HTTPS 页面必须连接 HTTPS/WSS 服务器。');
  return `${secure?'wss':'ws'}://${url.host}/forge`;
}
export function seatStorageKey(endpoint:string){return `forge-seat:${endpoint}`;}
