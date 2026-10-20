import http from 'node:http';
import net from 'node:net';
import { writeFileSync, appendFileSync } from 'node:fs';
const events = [];
let nextId = 0;
const ids = new WeakMap();
const observed = new WeakSet();
const record = (event, detail = {}) => { const item = { n: events.length, ns: process.hrtime.bigint().toString(), event, ...detail }; events.push(item); appendFileSync(`/private/tmp/be07-readiness-diagnostico-sol-20261009/observer-${process.pid}.ndjson`, JSON.stringify(item) + '\n'); };
const id = value => { if (!ids.has(value)) ids.set(value, ++nextId); return ids.get(value); };
function socketObserve(socket, role) {
  if (observed.has(socket)) return;
  observed.add(socket);
  record('socket-observe', { socket: id(socket), role, connecting: socket.connecting });
  for (const event of ['connect','end','close','timeout','error']) socket.on(event, value => record(`socket-${event}`, {socket:id(socket), role, code:value?.code, hadError:typeof value === 'boolean' ? value : undefined, local:socket.localPort, remote:socket.remotePort, destroyed:socket.destroyed }));
}
const originalDestroy = net.Socket.prototype.destroy;
net.Socket.prototype.destroy = function(...args) {
  if(observed.has(this)) record('socket-destroy',{socket:id(this),code:args[0]?.code,stack:new Error().stack, destroyed:this.destroyed});
  return Reflect.apply(originalDestroy,this,args);
};
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  if(!observed.has(this)) {
    observed.add(this);
    this.on('listening',()=>record('server-listening',{server:id(this),address:this.address()}));
    this.on('close',()=>record('server-close',{server:id(this),listening:this.listening}));
    this.on('connection',socket=>{socketObserve(socket,'server');record('server-connection',{server:id(this),socket:id(socket),local:socket.localPort,remote:socket.remotePort});});
    this.on('request',(req,res)=>{record('server-request',{server:id(this),socket:id(req.socket),method:req.method,url:req.url});res.on('finish',()=>record('response-finish',{server:id(this),socket:id(req.socket),status:res.statusCode}));});
    this.on('error',error=>record('server-error',{server:id(this),code:error.code}));
  }
  record('server-listen-call',{server:id(this),listening:this.listening,connections:this._connections});
  return Reflect.apply(originalListen,this,args);
};
const originalClose = http.Server.prototype.close;
http.Server.prototype.close = function(...args) { record('server-close-call',{server:id(this),listening:this.listening,connections:this._connections,stack:new Error().stack}); return Reflect.apply(originalClose,this,args); };
const originalRequest = http.request;
http.request = function(...args) {
  const req = Reflect.apply(originalRequest,this,args);
  record('client-request',{request:id(req),agentKeepAlive:req.agent?.keepAlive,host:req.host,path:req.path});
  req.on('socket',socket=>{socketObserve(socket,'client');record('client-socket',{request:id(req),socket:id(socket),reused:req.reusedSocket});});
  req.on('response',res=>record('client-response',{request:id(req),status:res.statusCode,connection:res.headers.connection}));
  req.on('error',error=>record('client-error',{request:id(req),code:error.code,message:error.message}));
  req.on('close',()=>record('client-close',{request:id(req)}));
  return req;
};
process.on('exit',code=>writeFileSync(`/private/tmp/be07-readiness-diagnostico-sol-20261009/observer-${process.pid}.json`,JSON.stringify({pid:process.pid,code,node:process.version,events},null,2)));
