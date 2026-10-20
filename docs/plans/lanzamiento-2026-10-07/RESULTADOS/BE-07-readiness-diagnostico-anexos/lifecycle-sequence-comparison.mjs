import './socket-observer.mjs';
import { Test } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/@nestjs/testing/index.js';
import { APP_GUARD } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/@nestjs/core/index.js';
import { ThrottlerGuard, ThrottlerModule } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/@nestjs/throttler/dist/index.js';
import request from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/supertest/index.js';
import { AppController } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/app.controller.js';
import { ReadinessService } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/readiness.service.js';
import { RedisService } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/redis/redis.service.js';
import { VisualIdentifyService } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/dist/modules/cards/visual-identify.service.js';
import { writeFileSync } from 'node:fs';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { deepStrictEqual } from 'node:assert';
const stages = [
  { database:'ready', scanner:'disabled', busy:false, path:'/api/ready', status:200 },
  { database:'ready', scanner:'disabled', busy:false, path:'/api/ready', status:200 },
  { database:'unavailable', scanner:'incompatible', busy:false, path:'/api/ready', status:503 },
  { database:'unavailable', scanner:'incompatible', busy:false, path:'/api/health', status:200 },
  { database:'ready', scanner:'ready', busy:true, path:'/api/ready', status:200 },
];
const results = { pid:process.pid, scope:'Nest compiled controller/mockdeps exact five-request sequence; no real DB/Redis/scanner', boundedCyclesPerVariant:60, stages, variants:[], failures:[], serversClosed:0 };
const redis = { configured:true, available:false, degradedSince:'2026-10-07T00:00:00.000Z', lastErrorAt:'2026-10-07T00:00:01.000Z' };
try {
  for(const variant of ['immediate', 'yield-setImmediate']) {
    const summary = { variant, cycles:0, requests:0, responses:[], elapsedMs:0 }; results.variants.push(summary);
    const started = performance.now();
    for(let cycle=0;cycle<results.boundedCyclesPerVariant;cycle++) {
      let state = stages[0];
      const module = await Test.createTestingModule({ imports:[ThrottlerModule.forRoot([{ttl:60000,limit:1}])], controllers:[AppController], providers:[
        {provide:APP_GUARD,useClass:ThrottlerGuard},
        {provide:RedisService,useValue:{status:()=>redis}},
        {provide:ReadinessService,useValue:{databaseState:()=>Promise.resolve(state.database)}},
        {provide:VisualIdentifyService,useValue:{readinessStatus:()=>({state:state.scanner,busy:state.busy})}},
      ] }).compile();
      const app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
      const server = app.getHttpServer();
      try {
        for(let phase=0;phase<stages.length;phase++) {
          state = stages[phase];
          if(variant==='yield-setImmediate') await yieldTurn();
          try {
            const response = await request(server).get(state.path).expect(state.status);
            if(state.path==='/api/ready') {
              deepStrictEqual(response.headers['cache-control'],'no-store');
              deepStrictEqual(response.body,{status:state.status===200?'ready':'not_ready',degraded:true,detail:{database:{state:state.database},scanner:{state:state.scanner,busy:state.busy},redis:{state:'degraded'}}});
            } else deepStrictEqual(response.body,{status:'ok',degraded:true,detail:{redis}});
            summary.requests++;
            if(cycle===0) summary.responses.push({phase,status:response.status,connection:response.headers.connection});
          } catch(error) {
            results.failures.push({variant,cycle,phase,message:error.message,code:error.code}); throw error;
          }
        }
        summary.cycles++;
      } finally {
        await app.close();
        if(server.listening) throw new Error('Servidor propio quedó escuchando');
        results.serversClosed++;
      }
    }
    summary.elapsedMs=performance.now()-started;
  }
} catch(error) {
  results.stoppedOnFirstFailure=true; process.exitCode=1;
} finally {
  results.finishedAt=new Date().toISOString();
  writeFileSync('/private/tmp/be07-readiness-diagnostico-sol-20261009/lifecycle-sequence-comparison.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
}
