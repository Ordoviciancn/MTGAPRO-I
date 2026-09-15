const { app, BrowserWindow, Menu, dialog, utilityProcess, ipcMain, clipboard, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {QuickTunnel}=require('./quick-tunnel.cjs');
let window, server, tunnel, quitting = false;
app.setName('MTG Simulator');
// Preserve existing decks and runtime settings across the product rename.
app.setPath('userData',path.join(app.getPath('appData'),'MTG Simulator'));
if(process.env.MTG_HEADLESS_HOST==='1')app.setPath('userData',path.join(app.getPath('userData'),'server-host'));
if(process.env.MTG_DESKTOP_SMOKE&&process.env.MTG_TEST_PROFILE)app.setPath('userData',process.env.MTG_TEST_PROFILE);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
app.on('second-instance', () => { const current = BrowserWindow.getAllWindows()[0]; if (current) { if (current.isMinimized()) current.restore(); current.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; tunnel?.stop(); server?.kill(); });
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function configure() {
  const bundled=path.join(app.isPackaged?app.getAppPath():path.resolve(__dirname,'../.desktop-stage'),'runtime');
  if(await exists(path.join(bundled,'manifest.json'))&&process.env.MTG_REMOTE_CLIENT!=='1')return {workspace:'',javaHome:path.join(bundled,'jdk'),bundled,mode:'host'};
  const configFile = path.join(app.getPath('userData'), 'runtime.json');
  let config = {};
  try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); } catch {}
  config.workspace = process.env.FORGE_WORKSPACE_ROOT || config.workspace || (!app.isPackaged ? path.resolve(__dirname, '..') : '');
  config.javaHome = process.env.JAVA_HOME || config.javaHome || '';
  if(process.env.MTG_REMOTE_CLIENT==='1'&&process.env.MTG_HEADLESS_HOST!=='1')return {workspace:'',javaHome:'',mode:'remote'};
  if(process.env.MTG_HEADLESS_HOST==='1')config.mode='host';
  if(!process.env.FORGE_WORKSPACE_ROOT&&config.mode!=='host'){
    const mode=await dialog.showMessageBox({type:'question',message:'选择联机方式',detail:'连接远程服务器无需安装 Forge 或 JDK。本机主持需要规则运行库。',buttons:['连接远程服务器','本机主持对局'],defaultId:0,cancelId:0});
    if(mode.response===0)return {workspace:'',javaHome:'',mode:'remote'};
    config.mode='host';
  }
  config.mode='host';
  for (const [key, marker, title] of [
    ['workspace', '.local-tools/forge/forge-gui/target/runtime-classpath.txt', '选择已构建 Forge 的 MTG Simulator 项目目录'],
    ['javaHome', 'bin/javac.exe', '选择 JDK 17 或更高版本目录']
  ]) {
    while (!config[key] || !await exists(path.join(config[key], marker))) {
      if(process.env.MTG_HEADLESS_HOST==='1')throw new Error(`Server runtime missing: ${marker}`);
      const result = await dialog.showOpenDialog({ title, properties: ['openDirectory'] });
      if (result.canceled) return null;
      config[key] = result.filePaths[0];
      if (!await exists(path.join(config[key], marker))) await dialog.showMessageBox({ type: 'error', message: '所选目录缺少所需运行文件', detail: marker });
    }
  }
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2));
  return config;
}
const logDir = () => path.join(app.getPath('userData'), 'logs');
const serverLogFile = () => path.join(logDir(), 'server.log');
let logStream = null;
function openServerLog() {
  try {
    fsSync.mkdirSync(logDir(), { recursive: true });
    const file = serverLogFile();
    // Keep a single bounded log; drop the oldest content once it grows past 2 MB.
    if (fsSync.existsSync(file) && fsSync.statSync(file).size > 2 * 1024 * 1024) fsSync.rmSync(file);
    logStream = fsSync.createWriteStream(file, { flags: 'a' });
    logStream.write(`\n==== MTG Simulator ${app.getVersion()} 启动 ${new Date().toISOString()} ====\n`);
  } catch { logStream = null; }
}
function logServerLine(data) {
  const text = data.toString();
  const stamped = text.replace(/^/gm, `[${new Date().toISOString()}] `);
  if (logStream) logStream.write(stamped);
  process.stdout.write(text);
}
async function start() {
  const config = await configure();
  if (!config) return app.quit();
  const root = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '../.desktop-stage');
  server = utilityProcess.fork(path.join(root, 'server-entry.mjs'), [], {
    cwd: root, env: { ...process.env, PORT: process.env.MTG_SERVER_PORT||'0', HOST: config.bundled?'127.0.0.1':config.mode==='host'?'0.0.0.0':'127.0.0.1', JAVA_HOME: config.javaHome, FORGE_WORKSPACE_ROOT: config.workspace,FORGE_BUNDLED_RUNTIME:config.bundled||'',FORGE_SESSION_ROOT:path.join(app.getPath('userData'),'forge-sessions'),FORGE_REMOTE_CLIENT_ONLY:config.mode==='remote'?'1':'0' },
    stdio: 'pipe', serviceName: 'MTG Rules Server'
  });
  openServerLog();
  server.stdout?.on('data', logServerLine);
  server.stderr?.on('data', logServerLine);
  server.on('exit', () => {
    logStream?.end();
    if (!quitting) { dialog.showErrorBox('规则服务已停止', '对局已暂停。请重新启动程序；未保存对局暂不支持恢复。\n\n诊断日志：' + serverLogFile()); app.quit(); }
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local server startup timed out.')), 30000);
    server.on('message', message => { if (message.type === 'ready') { clearTimeout(timer); resolve(message.port); } });
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Local server exited before startup.')); });
  });
  const origin = `http://127.0.0.1:${port}`;
  tunnel=new QuickTunnel({executable:path.join(root,'cloudflared/cloudflared.exe'),origin,onState:state=>{
    if(process.env.MTG_TUNNEL_STATE)void fs.writeFile(process.env.MTG_TUNNEL_STATE,JSON.stringify({...state,localOrigin:origin})).catch(error=>console.error(error.message));
  }});
  if(process.env.MTG_QUICK_TUNNEL==='1')await tunnel.start();
  if(process.env.MTG_HEADLESS_HOST==='1'){console.log(`MTG_SERVER_READY ${port}`);return;}
  const libraryFile=path.join(app.getPath('userData'),'deck-library.json');
  let libraryWrites=Promise.resolve();
  const checkSender=event=>{if(!event.senderFrame||new URL(event.senderFrame.url).origin!==origin)throw new Error('Unknown library client');};
  ipcMain.handle('tunnel:status',event=>{checkSender(event);return {...tunnel.status,available:config.mode==='host'};});
  ipcMain.handle('tunnel:start',async event=>{checkSender(event);if(config.mode!=='host')throw new Error('当前客户端未启用本机引擎');await tunnel.start();return tunnel.status;});
  ipcMain.handle('tunnel:stop',event=>{checkSender(event);tunnel.stop();return tunnel.status;});
  ipcMain.handle('library:load',async event=>{checkSender(event);await libraryWrites;try{return await fs.readFile(libraryFile,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}});
  ipcMain.handle('library:save',(event,json)=>{
    checkSender(event);if(typeof json!=='string'||Buffer.byteLength(json,'utf8')>524288)throw new Error('牌组库过大');JSON.parse(json);
    const write=libraryWrites.then(async()=>{await fs.mkdir(path.dirname(libraryFile),{recursive:true});await fs.writeFile(libraryFile+'.tmp',json,'utf8');await fs.rename(libraryFile+'.tmp',libraryFile);});
    libraryWrites=write.catch(()=>{});return write;
  });
  window = new BrowserWindow({ width: 1600, height: 980, minWidth: 1000, minHeight: 700, backgroundColor: '#101719', show: false,
    webPreferences: { preload:path.join(root,'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '对局', submenu: [{ label: '打开诊断日志', click: () => { shell.showItemInFolder(serverLogFile()); } }, { label: '新窗口（第二位本机玩家）', click: () => {
      const second = new BrowserWindow({ width: 1400, height: 900, webPreferences: { preload:path.join(root,'preload.cjs'),nodeIntegration: false, contextIsolation: true, sandbox: true } });
      second.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      second.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
      second.loadURL(origin + '/?forge');
    } }, {label:'服务器连接地址',click:()=>dialog.showMessageBox({message:config.mode==='host'?'本机主持已启用':'远程客户端模式',detail:config.bundled?'本机服务：'+origin+'\n请使用公网联机菜单生成邀请地址。':config.mode==='host'?Object.values(os.networkInterfaces()).flat().filter(ip=>ip&&ip.family==='IPv4'&&!ip.internal).map(ip=>`http://${ip.address}:${port}`).join('\n')+'\n同一网络的玩家可填写以上地址。公网访问需服务器网络配置。':'请在大厅填写远程服务器地址。'})}, { label: '运行环境位置', click: () => dialog.showMessageBox({ message: 'Forge 运行环境', detail: `项目：${config.bundled||config.workspace||'未启用本机引擎'}\nJDK：${config.javaHome||'无需本机安装'}\n设置文件：${path.join(app.getPath('userData'), 'runtime.json')}` }) }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
    {label:'公网联机',submenu:[{label:'开启并复制邀请地址',enabled:config.mode==='host',click:async()=>{const state=await tunnel.start();if(state.phase==='ready'){clipboard.writeText(state.url);await dialog.showMessageBox({message:'邀请地址已复制',detail:state.url+'\n把地址发给对手，在同一服务器创建和加入房间。'});}else await dialog.showMessageBox({type:'error',message:state.error||'隧道尚未就绪'});}},{label:'关闭公网入口',click:()=>tunnel.stop()}]},
    { label: '视图', submenu: [{ role: 'togglefullscreen', label: '全屏' }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }] }
  ]));
  await window.loadURL(origin + '/?forge');
  window.show();
  if (process.env.MTG_DESKTOP_SMOKE) {
    const health = await fetch(origin + '/health');
    if (!health.ok) throw new Error('Health check failed.');
    const rendered = await window.webContents.executeJavaScript('Boolean(document.querySelector("#root")?.firstElementChild)');
    if (!rendered) throw new Error('The application root did not render.');
    let libraryPersisted=false;
    if(process.env.MTG_TEST_PROFILE){libraryPersisted=await window.webContents.executeJavaScript('(async()=>{const value=JSON.stringify({version:1,decks:[{id:"desktop-check",name:"保存验证",text:"60 Mountain",updatedAt:new Date().toISOString()}]});await window.mtgDesktop.saveLibrary(value);return await window.mtgDesktop.loadLibrary()===value;})()');if(!libraryPersisted)throw new Error('Deck persistence check failed');}
    const title=window.webContents.getTitle();
    if(title!==app.getName())throw new Error('Window title does not match the product name');
    await fs.writeFile(process.env.MTG_DESKTOP_SMOKE, JSON.stringify({ executable: process.execPath, appName:app.getName(),title,packaged: app.isPackaged, health: await health.json(), url: window.webContents.getURL(), loaded: !window.webContents.isLoading(), rendered,libraryPersisted,mode:config.mode }));
    app.quit();
  }
}
if (single) app.whenReady().then(start).catch(error => { openServerLog(); dialog.showErrorBox('启动失败', error.message + '\n\n诊断日志：' + serverLogFile()); app.quit(); });
