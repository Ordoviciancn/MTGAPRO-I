import {useEffect,useState} from 'react';
export interface TunnelState {phase:'idle'|'starting'|'ready'|'error';url?:string;error?:string;available?:boolean}
export function TunnelPanel(){
  const api=window.mtgDesktop;
  const [state,setState]=useState<TunnelState>({phase:'idle'}),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  useEffect(()=>{if(!api?.tunnelStatus)return;let active=true;const refresh=()=>api.tunnelStatus!().then(value=>{if(active)setState(value);}).catch(()=>{if(active)setError('无法读取公网连接状态。');});void refresh();const timer=setInterval(refresh,1000);return()=>{active=false;clearInterval(timer);};},[api]);
  if(!api?.startTunnel||state.available===false)return null;
  async function start(){setError('');setState({...state,phase:'starting'});try{setState(await api!.startTunnel!());}catch(error){setState({phase:'error'});setError(String(error));}}
  async function stop(){try{setState(await api!.stopTunnel!());setCopied(false);}catch(error){setError(String(error));}}
  return <div className="lobby-tunnel"><h3>邀请朋友联机</h3><p className="lobby-help">在本机创建房间，开启公网入口，再把地址发给对手。主持期间保持软件运行。</p>
    <button className="lobby-primary" disabled={state.phase==='starting'} onClick={()=>void(state.phase==='ready'?stop():start())}>{state.phase==='ready'?'关闭公网入口':state.phase==='starting'?'正在建立公网入口…':'开启公网联机'}</button>
    {state.phase==='ready'&&state.url&&<><label>邀请地址<input readOnly value={state.url}/></label><button onClick={()=>{void navigator.clipboard.writeText(state.url!).then(()=>setCopied(true)).catch(()=>setError('复制失败，请手动复制地址。'));}}>{copied?'已复制':'复制邀请地址'}</button></>}
    {(error||state.error)&&<p role="alert">{error||state.error}</p>}<p className="lobby-help">临时地址在重新开启后变化；关闭入口会断开公网对手。</p></div>;
}
