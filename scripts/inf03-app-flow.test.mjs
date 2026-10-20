import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_FIXTURE, appFixture, operationHash, fixtureSQL, assertPublicPayload, assertNoPrivateSSR, verifyAppContainer } from './inf03-app-flow.mjs';

test('operación restaurada conserva canonicalización y distingue nueva intención/payload', () => {
  const fixture=appFixture();
  assert.match(fixture.key,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(operationHash({cardId:APP_FIXTURE.card}),operationHash({cardId:APP_FIXTURE.card,variant:'normal',condition:'NM',quantity:1}));
  assert.notEqual(fixture.hash,operationHash({...fixture.payload,quantity:1}));
  assert.notEqual(operationHash({cardId:APP_FIXTURE.card}),operationHash({cardId:APP_FIXTURE.card,isForTrade:false}));
  assert.match(fixtureSQL(fixture),new RegExp(fixture.hash));
  assert.throws(()=>fixtureSQL({...fixture,key:'legacy-not-UUID'}));
  assert.throws(()=>fixtureSQL({...fixture,hash:'0'.repeat(64)}));
});
const payload=()=>({ownerDisplayName:'Fixture A',collectionName:'Synthetic collection',items:[{card:{id:APP_FIXTURE.card},variant:'normal',condition:'NM',quantity:3,price:null},{card:{id:APP_FIXTURE.card},variant:'holofoil',condition:'LP',quantity:3,price:null}],stats:{totalGroups:2,totalCards:6,uniqueCards:1,duplicateCards:4,setsCount:1,totalValueUsd:null,pricedGroups:0,cardsMissingPrice:6},truncated:false,sharedAt:'2026-10-08T12:00:00.000Z'});
test('allowlist rechaza extras privados y sentinel dentro del catálogo',()=>{
  assert.doesNotThrow(()=>assertPublicPayload(payload()));
  assert.throws(()=>assertPublicPayload({...payload(),email:'private@example.invalid'}));
  const p=payload();p.items[0].notes=APP_FIXTURE.privateNote;assert.throws(()=>assertPublicPayload(p));
  const nested=payload();nested.items[0].card.name=APP_FIXTURE.privateNote;assert.throws(()=>assertPublicPayload(nested));
});
test('SSR disponible y terminal requieren noindex y excluyen host/datos privados',()=>{
  const robots='<meta name="robots" content="noindex, nofollow">';
  assert.doesNotThrow(()=>assertNoPrivateSSR(robots+'Synthetic collection Synthetic Fixture Card','private:3001',true));
  assert.doesNotThrow(()=>assertNoPrivateSSR(robots+'Colección compartida','private:3001',false));
  assert.throws(()=>assertNoPrivateSSR(robots+'Fixture A','private:3001',false));
  assert.throws(()=>assertNoPrivateSSR(robots+'private:3001','private:3001',false));
  assert.throws(()=>assertNoPrivateSSR('Colección compartida','private:3001',false));
});
const context={runId:'inf03-123456789abc',role:'app-backend',image:'sha256:test',network:'inf03-123456789abc-destination-net',port:34567};
const info=()=>({Config:{Labels:{'com.pokescan.inf03.run':context.runId,'com.pokescan.inf03.role':context.role,'com.pokescan.inf03.project':'pokemon-cards-scanner-app'}},Image:context.image,HostConfig:{Privileged:false,NetworkMode:context.network},NetworkSettings:{Ports:{'3001/tcp':null},Networks:{[context.network]:{}}},Mounts:[]});
test('ownership exige imagen/red propias y API sin publish',()=>{
  assert.doesNotThrow(()=>verifyAppContainer(info(),context));
  for(const mutate of [i=>i.Config.Labels['com.pokescan.inf03.run']='foreign',i=>i.Image='foreign',i=>i.HostConfig.Privileged=true,i=>i.Mounts.push({Name:'foreign'}),i=>i.NetworkSettings.Networks.foreign={},i=>i.NetworkSettings.Ports['3001/tcp']=[{HostIp:'127.0.0.1',HostPort:'34567'}]]){const i=info();mutate(i);assert.throws(()=>verifyAppContainer(i,context));}
});
test('web sólo acepta un bind loopback exacto',()=>{
  const c={...context,role:'app-frontend',ingress:'own-ingress'},i=info();i.Config.Labels['com.pokescan.inf03.role']=c.role;i.NetworkSettings.Networks[c.ingress]={};i.NetworkSettings.Ports={'3000/tcp':[{HostIp:'127.0.0.1',HostPort:String(c.port)}]};
  assert.doesNotThrow(()=>verifyAppContainer(i,c));
  i.NetworkSettings.Ports['3000/tcp'][0].HostIp='0.0.0.0';assert.throws(()=>verifyAppContainer(i,c));
});
