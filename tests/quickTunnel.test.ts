import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {QuickTunnel} = createRequire(import.meta.url)('../desktop/quick-tunnel.cjs');

function fixture(timeoutMs=1000) {
  const children:any[]=[];
  const calls:any[]=[];
  const states:any[]=[];
  const tunnel=new QuickTunnel({executable:'cloudflared.exe',origin:'http://127.0.0.1:8787',timeoutMs,
    onState:(state:any)=>states.push(state),spawnImpl:(...args:any[])=>{
      calls.push(args);
      const child:any=new EventEmitter();
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.killed=false;
      child.kill=()=>{child.killed=true;child.emit('exit',0);};
      children.push(child);return child;
    }});
  return {tunnel,children,calls,states};
}

test('quick tunnel only exposes a loopback HTTP server',()=>{
  for(const origin of ['https://127.0.0.1','http://localhost','http://0.0.0.0','http://example.com','http://127.0.0.1/path','http://user:pass@127.0.0.1','http://127.0.0.1?x=1'])
    assert.throws(()=>new QuickTunnel({executable:'x',origin}));
});

test('quick tunnel requires both a URL and registered connection, with no concurrent start',async()=>{
  const {tunnel,children,calls}=fixture();
  const pending=tunnel.start();assert.equal(tunnel.start(),pending);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0][1],['tunnel','--no-autoupdate','--url','http://127.0.0.1:8787']);
  assert.equal(calls[0][2].windowsHide,true);assert.equal(calls[0][2].shell,false);
  children[0].stderr.emit('data','URL https://test-room.trycloud');
  children[0].stderr.emit('data','flare.com\n');
  assert.equal(tunnel.status.phase,'starting');
  children[0].stderr.emit('data','Registered tunnel connection');
  assert.deepEqual(await pending,{phase:'ready',url:'https://test-room.trycloudflare.com'});
  assert.equal(tunnel.start(),pending);
  tunnel.stop();assert.equal(children[0].killed,true);assert.equal(tunnel.status.phase,'idle');
});

test('stop cancels startup and stale child logs cannot publish a new URL',async()=>{
  const {tunnel,children}=fixture();
  const pending=tunnel.start();tunnel.stop();assert.equal((await pending).phase,'idle');
  const next=tunnel.start();
  children[0].stderr.emit('data','https://stale.trycloudflare.com\nRegistered tunnel connection');
  assert.equal(tunnel.status.phase,'starting');
  children[1].stdout.emit('data','Registered tunnel connection\n');
  children[1].stderr.emit('data','https://fresh.trycloudflare.com\n');
  assert.equal((await next).url,'https://fresh.trycloudflare.com');tunnel.stop();
});

test('timeout and unexpected child failure report error and permit restart',async()=>{
  const {tunnel,children}=fixture(10);
  assert.equal((await tunnel.start()).phase,'error');assert.equal(children[0].killed,true);
  const pending=tunnel.start();children[1].emit('error',new Error('failed'));
  assert.equal((await pending).phase,'error');
  const ready=tunnel.start();children[2].stderr.emit('data','https://ready.trycloudflare.com\nRegistered tunnel connection');
  await ready;children[2].emit('exit',1);assert.equal(tunnel.status.phase,'error');tunnel.stop();
});

test('synchronous launch failure does not leave startup pending or expose native errors',async()=>{
  const tunnel=new QuickTunnel({executable:'missing.exe',origin:'http://127.0.0.1:8787',
    spawnImpl:()=>{throw new Error('private local path');}});
  const result=await tunnel.start();
  assert.equal(result.phase,'error');assert.ok(!result.error.includes('private local path'));
  assert.equal(tunnel.run,null);tunnel.stop();
});
