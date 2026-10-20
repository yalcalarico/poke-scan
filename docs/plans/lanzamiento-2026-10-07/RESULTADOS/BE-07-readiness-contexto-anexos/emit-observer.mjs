import http from 'node:http';
import net from 'node:net';
import { writeFileSync } from 'node:fs';
const events=[];
const ids=new WeakMap();
const sockets=new WeakSet();
const socketRoles=new WeakMap();
const changes=[];
let counter=0;
let phase='bootstrap';
const id=value=>{if(!value||typeof value!=='object')return undefined;if(!ids.has(value))ids.set(value,++counter);return ids.get(value);};
const note=(event,data={})=>events.push({n:events.length,ns:process.hrtime.bigint().toString(),phase,event,...data});
const socketState=socket=>socket?{socket:id(socket),role:socketRoles.get(socket),localPort:socket.localPort,remotePort:socket.remotePort,bytesRead:socket.bytesRead,bytesWritten:socket.bytesWritten,destroyed:socket.destroyed,readable:socket.readable,writable:socket.writable,parserPresent:Boolean(socket.parser),parserIncomingComplete:socket.parser?.incoming?.complete,parserIncomingAborted:socket.parser?.incoming?.aborted}:{};
const track=(socket,role)=>{if(socket){sockets.add(socket);socketRoles.set(socket,role);}};
function wrap(proto,kind,select,beforeDetail,afterDetail=()=>({})) {
  const ownDescriptor=Object.getOwnPropertyDescriptor(proto,'emit');
  const original=proto.emit;
  const wrapped=function(event,...args) {
    if(!select(this,event,args))return Reflect.apply(original,this,[event,...args]);
    const beforeListeners=this.listenerCount(event);
    const detail=beforeDetail(this,event,args);
    note(`${kind}:${event}:before`,{object:id(this),listenerCount:beforeListeners,...detail});
    let completed=false;
    let returned;
    try {returned=Reflect.apply(original,this,[event,...args]);completed=true;return returned;}
    finally {note(`${kind}:${event}:after`,{object:id(this),listenerCount:this.listenerCount(event),originalReturned:completed?returned:undefined,originalThrew:!completed,...afterDetail(this,event,args)});}
  };
  Object.defineProperty(proto,'emit',{value:wrapped,writable:true,configurable:true});
  changes.push({proto,kind,ownDescriptor,original,wrapped});
}
wrap(http.Server.prototype,'server',(_s,event)=>['listening','connection','request','clientError','close','error'].includes(event),(server,event,args)=>{
  if(event==='connection')track(args[0],'server');
  if(event==='request'){track(args[0].socket,'server');id(args[0]);id(args[1]);}
  const socket=event==='connection'?args[0]:event==='clientError'?args[1]:event==='request'?args[0].socket:undefined;
  return {server:id(server),listening:server.listening,address:server.address(),clientErrorListeners:server.listenerCount('clientError'),request:event==='request'?id(args[0]):undefined,response:event==='request'?id(args[1]):undefined,url:event==='request'?args[0].url:undefined,errorCode:(event==='clientError'||event==='error')?args[0]?.code:undefined,errorBytesParsed:event==='clientError'?args[0]?.bytesParsed:undefined,...socketState(socket)};
},(_server,event,args)=>event==='connection'?socketState(args[0]):{});
wrap(http.ClientRequest.prototype,'client',(_req,event)=>['socket','response','error','close','abort'].includes(event),(req,event,args)=>{
  if(event==='socket')track(args[0],'client');
  if(event==='response')id(args[0]);
  return {request:id(req),path:req.path,reusedSocket:req.reusedSocket,agentKeepAlive:req.agent?.keepAlive,response:event==='response'?id(args[0]):undefined,status:event==='response'?args[0].statusCode:undefined,errorCode:event==='error'?args[0]?.code:undefined,errorMessage:event==='error'?args[0]?.message:undefined,...socketState(event==='socket'?args[0]:req.socket)};
});
wrap(http.IncomingMessage.prototype,'incoming',(req,event)=>sockets.has(req.socket)&&['aborted','end','error','close'].includes(event),(req,event,args)=>({incoming:id(req),complete:req.complete,aborted:req.aborted,status:req.statusCode,method:req.method,errorCode:event==='error'?args[0]?.code:undefined,...socketState(req.socket)}));
wrap(http.ServerResponse.prototype,'response',(_res,event)=>['finish','close','error'].includes(event),(res,event,args)=>({response:id(res),status:res.statusCode,headersSent:res.headersSent,finished:res.finished,writableEnded:res.writableEnded,errorCode:event==='error'?args[0]?.code:undefined,...socketState(res.socket)}));
wrap(net.Socket.prototype,'socket',(socket,event)=>sockets.has(socket)&&['connect','data','end','error','close','timeout'].includes(event),(socket,event,args)=>({errorCode:event==='error'?args[0]?.code:undefined,hadError:event==='close'?args[0]:undefined,chunkLength:event==='data'?args[0]?.length:undefined,...socketState(socket)}));
const api={
  mark(value){phase=value;note('phase');},
  flush(){
    const restored=changes.map(({proto,kind,ownDescriptor,original})=>{if(ownDescriptor)Object.defineProperty(proto,'emit',ownDescriptor);else delete proto.emit;return {kind,restored:proto.emit===original,ownDescriptorRestored:JSON.stringify(Object.getOwnPropertyDescriptor(proto,'emit'))===JSON.stringify(ownDescriptor)};});
    const path=`/private/tmp/be07-readiness-contexto-sol-20261009/emit-trace-${process.pid}.json`;
    writeFileSync(path,JSON.stringify({pid:process.pid,ppid:process.ppid,node:process.version,allOriginalEmitMethodsRestored:restored.every(v=>v.restored&&v.ownDescriptorRestored),restored,noObservationListenersAdded:true,events},null,2));
  },
};
globalThis[Symbol.for('be07.contexto.emitObserver')]=api;
