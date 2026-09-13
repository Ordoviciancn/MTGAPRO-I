import http from 'node:http';
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.once('listening', () => process.parentPort?.postMessage({ type: 'ready', port: this.address().port }));
  return listen.apply(this, args);
};
await import('./src/server/index.mjs');
