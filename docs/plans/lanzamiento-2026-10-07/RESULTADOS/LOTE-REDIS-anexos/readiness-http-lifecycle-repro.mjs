import { Test } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/@nestjs/testing/index.js';
import { APP_GUARD } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/@nestjs/core/index.js';
import { ThrottlerGuard, ThrottlerModule } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/@nestjs/throttler/dist/index.js';
import request from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/supertest/index.js';
import {AppController} from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/app.controller.js';
import {ReadinessService} from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/readiness.service.js';
import {RedisService} from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/redis/redis.service.js';
import {VisualIdentifyService} from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/modules/cards/visual-identify.service.js';
import {writeFileSync} from 'node:fs';
const out='/private/tmp/be07-gate-sol-20261009';
let database='ready',scanner='ready',busy=true;
const module=await Test.createTestingModule({imports:[ThrottlerModule.forRoot([{ttl:60000,limit:1}])],controllers:[AppController],providers:[{provide:APP_GUARD,useClass:ThrottlerGuard},{provide:RedisService,useValue:{status:()=>({configured:true,available:false,degradedSince:'2026-10-07T00:00:00.000Z',lastErrorAt:null})}},{provide:ReadinessService,useValue:{databaseState:()=>Promise.resolve(database)}},{provide:VisualIdentifyService,useValue:{readinessStatus:()=>({state:scanner,busy})}}]}).compile();
const app=module.createNestApplication();app.setGlobalPrefix('api');await app.init();const server=app.getHttpServer();let phase=0,received=0;const events=[];const note=(name,data={})=>{events.push({name,phase,ms:performance.now(),...data});if(events.length>100)events.shift()};
server.on('listening',()=>note('listening',{port:server.address().port}));server.on('close',()=>note('close'));server.on('request',()=>{received++;note('request')});server.on('connection',socket=>{note('connection');socket.on('close',hadError=>note('socket-close',{hadError}));socket.on('error',e=>note('socket-error',{code:e.code}))});
const result={scope:'same Nest/controller/mock dependencies; Supertest auto-listen/close sequential',pid:process.pid,requests:0,failures:[],boundedMax:300};
try{for(phase=0;phase<300;phase++){try{const r=await request(server).get('/api/ready').expect(200);if(r.body.detail.scanner.busy!==true)throw new Error('busy distinto');result.requests++;}catch(e){result.failures.push({phase,code:e.code,message:e.message,received,events:[...events]});break;}}}finally{await app.close();result.serverListeningAfterClose=server.listening;writeFileSync(out+'/readiness-lifecycle-repro.json',JSON.stringify(result,null,2));console.log(JSON.stringify({requests:result.requests,failures:result.failures.length,listenerAfter:server.listening}));}
