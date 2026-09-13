const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mtgDesktop',{
  loadLibrary:()=>ipcRenderer.invoke('library:load'),
  saveLibrary:json=>ipcRenderer.invoke('library:save',json),
  tunnelStatus:()=>ipcRenderer.invoke('tunnel:status'),
  startTunnel:()=>ipcRenderer.invoke('tunnel:start'),
  stopTunnel:()=>ipcRenderer.invoke('tunnel:stop')
});
