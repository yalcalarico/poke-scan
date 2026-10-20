import {createServer,createConnection} from 'node:net';
import {readFileSync,writeFileSync} from 'node:fs';
const out='/private/tmp/be07-global-469af22a0f8f';
const sockets=new Set();
const stats={pid:process.pid,accepted:0,rejected:0,forwarded:0,mode:'offline'};
function mode(){return JSON.parse(readFileSync(out+'/proxy-state.json','utf8')).mode;}
function save(){writeFileSync(out+'/proxy-stats.json',JSON.stringify({...stats,liveSockets:sockets.size,at:new Date().toISOString()},null,2));}
const server=createServer((downstream)=>{
 stats.accepted+=1;
 if(mode()==='offline'){stats.rejected+=1;downstream.destroy();save();return;}
 stats.forwarded+=1;
 const upstream=createConnection({host:'127.0.0.1',port:56391});
 for(const socket of [downstream,upstream]){sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);upstream.destroy();downstream.destroy();save();});}
 downstream.pipe(upstream);upstream.pipe(downstream);save();
});
const timer=setInterval(()=>{const current=mode();if(stats.mode!==current){stats.mode=current;if(current==='offline')for(const s of sockets)s.destroy();save();}},50);
server.listen(56392,'127.0.0.1',()=>{save();console.log(JSON.stringify({type:'listening',pid:process.pid,port:56392}));});
process.on('SIGTERM',()=>{clearInterval(timer);for(const s of sockets)s.destroy();server.close(()=>{stats.shutdown=true;save();process.exit(0);});});
