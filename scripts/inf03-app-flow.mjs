import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { assertResource, sql } from './inf03-common.mjs';

export const APP_FIXTURE = Object.freeze({
  owner: '11111111-1111-4111-8111-111111111111', other: '22222222-2222-4222-8222-222222222222',
  collection: '44444444-4444-4444-8444-444444444444', item: '55555555-5555-4555-8555-555555555555',
  share: '77777777-7777-4777-8777-777777777777', slug: 'inf03-fixture-share', card: 'inf03set-1',
  privateNote: 'INF03-NOTA-PRIVADA-GATE',
});
const EXPECTED_IMAGES = {
  backend: 'sha256:1e92edf09a920cf1e42017644cf054a11b90b20d2d54ef6bf41dd58dd6c647f3',
  frontend: 'sha256:c89a6a501f8929b82ff562c8b3e06e8337f6d53beaf0f744bd0395e6d8241c5f',
};
export function operationHash(payload) {
  return createHash('sha256').update(JSON.stringify({ collectionId: APP_FIXTURE.collection, cardId: payload.cardId,
    variant: payload.variant ?? 'normal', condition: payload.condition ?? 'NM', quantity: payload.quantity ?? 1,
    notes: payload.notes ?? null, isForTrade: payload.isForTrade ?? null })).digest('hex');
}
export function appFixture() {
  const key = randomUUID();
  const payload = { cardId: APP_FIXTURE.card, variant: 'normal', condition: 'NM', quantity: 2,
    notes: APP_FIXTURE.privateNote, isForTrade: false };
  return { key, payload, hash: operationHash(payload) };
}
export function fixtureSQL(fixture) {
  if (!/^[a-f0-9-]{36}$/.test(fixture.key) || fixture.hash !== operationHash(fixture.payload)) throw new Error('Fixture de operación inválida.');
  return `UPDATE collection_items SET notes='${APP_FIXTURE.privateNote}' WHERE id='${APP_FIXTURE.item}';
UPDATE cards SET "imageSmall"='/icons/icon-192.png',"imageLarge"='/icons/icon-192.png' WHERE id='${APP_FIXTURE.card}';
INSERT INTO collection_item_add_operations ("userId",key,"payloadHash","resultItemId","expiresAt","createdAt") VALUES ('${APP_FIXTURE.owner}','${fixture.key}','${fixture.hash}','${APP_FIXTURE.item}',now()+interval '1 day',now());`;
}
const equalKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
export function assertPublicPayload(value) {
  if (!equalKeys(value, ['ownerDisplayName','collectionName','items','stats','truncated','sharedAt'])
    || !Array.isArray(value.items) || value.items.length !== 2
    || !value.items.every((item) => equalKeys(item, ['card','variant','condition','quantity','price']))
    || !equalKeys(value.stats, ['totalGroups','totalCards','uniqueCards','duplicateCards','setsCount','totalValueUsd','pricedGroups','cardsMissingPrice'])) throw new Error('Allowlist pública inválida.');
  const serialized = JSON.stringify(value);
  if ([APP_FIXTURE.privateNote, APP_FIXTURE.owner, APP_FIXTURE.other, APP_FIXTURE.collection, APP_FIXTURE.item,
    'fixture-a@example.invalid','synthetic-hash-a','passwordHash','notes','isForTrade'].some((text) => serialized.includes(text))) throw new Error('Payload público filtró campo privado.');
}
export function assertNoPrivateSSR(html, privateHost, available) {
  if ([privateHost, 'backend:3001', '127.0.0.1:1/api', APP_FIXTURE.privateNote, 'fixture-a@example.invalid',
    APP_FIXTURE.owner, APP_FIXTURE.item, 'synthetic-hash-a'].some((text) => html.includes(text))) throw new Error('SSR filtró información privada.');
  const robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/i)?.[1] ?? '';
  if (!robots.includes('noindex')) throw new Error('SSR share no emitió noindex.');
  if (available ? !html.includes('Synthetic collection') || !html.includes('Synthetic Fixture Card')
    : ['Synthetic collection','Synthetic Fixture Card','Fixture A'].some((text) => html.includes(text))) throw new Error('SSR share entregó contenido inesperado.');
}
export function verifyAppContainer(info, { runId, role, image, network, port, ingress }) {
  const labels = info.Config.Labels;
  const bindings = Object.entries(info.NetworkSettings.Ports ?? {}).filter(([, value]) => value?.length);
  if (labels?.['com.pokescan.inf03.run'] !== runId || labels?.['com.pokescan.inf03.role'] !== role
    || labels?.['com.pokescan.inf03.project'] !== 'pokemon-cards-scanner-app' || info.Image !== image
    || info.HostConfig.Privileged || info.HostConfig.NetworkMode === 'host'
    || Object.keys(info.NetworkSettings.Networks).length !== (role === 'app-frontend' ? 2 : 1)
    || !info.NetworkSettings.Networks[network] || (role === 'app-frontend' && !info.NetworkSettings.Networks[ingress])
    || info.Mounts.length !== 0 || (role !== 'app-frontend' ? bindings.length !== 0
      : bindings.length !== 1 || bindings[0][0] !== '3000/tcp' || bindings[0][1].length !== 1
        || bindings[0][1][0].HostIp !== '127.0.0.1' || bindings[0][1][0].HostPort !== String(port))) throw new Error('Identidad/aislamiento app incompatibles.');
}
const requestCode = `import {createHmac} from 'node:crypto';
let input='';for await(const part of process.stdin)input+=part;const q=JSON.parse(input);
const headers={'Accept':'application/json'};
if(q.user){const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({sub:q.user,email:'synthetic@example.invalid',iat:now,exp:now+300})).toString('base64url');headers.Authorization='Bearer '+head+'.'+body+'.'+createHmac('sha256',process.env.JWT_SECRET).update(head+'.'+body).digest('base64url');}
if(q.key)headers['Idempotency-Key']=q.key;if(q.body)headers['Content-Type']='application/json';
const response=await fetch(q.web?'http://inf03-app-web:3000'+q.path:'http://127.0.0.1:3001/api'+q.path,{method:q.method??'GET',headers,body:q.body?JSON.stringify(q.body):undefined,signal:AbortSignal.timeout(10000),cache:'no-store'});
const text=await response.text();if(text.length>2*1024*1024)throw Error('response-limit');console.log(JSON.stringify({status:response.status,cache:response.headers.get('cache-control'),text}));`;

export async function runAppFlow({ runId, destination, projectDir, fixture, register, registerNetwork }) {
  if (!/^inf03-[a-f0-9]{12}$/.test(runId) || destination.container !== `${runId}-destination-pg`
    || destination.db !== 'inf03_destination' || destination.user !== 'inf03_destination'
    || destination.network !== `${runId}-destination-net`) throw new Error('Contexto app inválido.');
  // Las guardas del restore siguen exclusivas: recién después del positivo se une el consumidor.
  const databaseId = assertResource(runId, destination.container, 'destination');
  const docker = (args, options = {}) => {
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 3*1024*1024, ...options });
    if (result.error || result.status !== 0) {
      const classes=['ECONNREFUSED','ENOTFOUND','SyntaxError','TypeError','ERR_MODULE_NOT_FOUND','P1000','P1001','PrismaClientInitializationError'];
      const category=classes.find((name)=>String(result.stderr).includes(name))??'unknown';
      throw new Error(`Proceso Docker app ${args[0]} rechazado (${result.status??'timeout'}, ${category}); salida sanitizada.`);
    }
    return result.stdout;
  };
  const inspect = (name) => JSON.parse(docker(['inspect',name]))[0];
  const report = { mode: 'restored-db-api-ssr', scanner: 'disabled', authentication: 'synthetic-HS256-no-login', checks: [], cleanup: { complete: false } };
  const images = Object.fromEntries(Object.keys(EXPECTED_IMAGES).map((role) => [role, JSON.parse(docker(['image','inspect',`inf02-${role}:local`]))[0]]));
  for (const role of Object.keys(images)) if (images[role].Id !== EXPECTED_IMAGES[role] || images[role].Architecture !== 'arm64') throw new Error('Imagen app difiere de INF-02 aceptada.');
  const redisImage = JSON.parse(docker(['image','inspect','redis:7-alpine']))[0].Id;
  report.images = Object.fromEntries(Object.keys(images).map((role) => [role, {id:images[role].Id,created:images[role].Created}]));
  const listener = createServer();
  await new Promise((resolve,reject) => {listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const secret = randomBytes(48).toString('base64url');
  const envFile = path.join(projectDir,'app-runtime.env');
  const databaseUrl = `postgresql://${destination.user}:${encodeURIComponent(destination.password)}@${destination.container}:5432/${destination.db}`;
  await writeFile(envFile, Object.entries({ NODE_ENV:'production',PORT:'3001',DATABASE_URL:databaseUrl,
    REDIS_URL:'redis://inf03-app-redis:6379',JWT_SECRET:secret,JWT_REFRESH_SECRET:randomBytes(48).toString('base64url'),
    SCANNER_VISUAL_ENABLED:'0',PRICE_QUEUE_ENABLED:'false',ENABLE_CATALOG_SYNC_CRON:'false',ENABLE_PRICE_BACKFILL_CRON:'false',ENABLE_RETENTION_CRON:'false',
    FRONTEND_URL:`https://localhost:${port}`,CORS_ORIGINS:`https://localhost:${port}` }).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
  const owned = [];
  const ingress=`${runId}-app-ingress`;
  let ingressId;
  const check = (name, condition) => {if(!condition)throw new Error(`Gate app falló: ${name}.`);report.checks.push(name);};
  const request = (q) => JSON.parse(docker(['exec','-i',`${runId}-app-backend`,'node','--input-type=module','-e',requestCode],{input:JSON.stringify(q)}));
  const parse = (response) => JSON.parse(response.text);
  const pairs = () => sql(destination.container,destination.db,`SELECT string_agg(variant||':'||condition||':'||quantity,',' ORDER BY variant) FROM collection_items WHERE "collectionId"='${APP_FIXTURE.collection}';`,destination.user).trim();
  const activeSnapshot = () => sql(destination.container,destination.db,`SELECT "isActive"||'|'||quantity FROM share_links,collection_items WHERE share_links.id='${APP_FIXTURE.share}' AND collection_items.id='${APP_FIXTURE.item}';`,destination.user).trim();
  function create(role,image,args) {
    const name=`${runId}-${role}`;
    const id=docker(['run','--detach','--name',name,'--network',role==='app-frontend'?ingress:destination.network,
      '--label',`com.pokescan.inf03.run=${runId}`,'--label',`com.pokescan.inf03.role=${role}`,
      '--label','com.pokescan.inf03.project=pokemon-cards-scanner-app',...args,image]).trim();
    owned.push({name,id,role,image});register(name,role);
    if(role==='app-frontend')docker(['network','connect','--alias','inf03-app-web',destination.network,name]);
  }
  const verifyOwned = () => {
    for(const resource of owned) {const info=inspect(resource.name);if(info.Id!==resource.id)throw Error('Container app reemplazado.');verifyAppContainer(info,{runId,role:resource.role,image:resource.image,network:destination.network,port,ingress});}
    const network=JSON.parse(docker(['network','inspect',destination.network]))[0];
    if(!network.Internal || network.Labels?.['com.pokescan.inf03.run']!==runId || Object.keys(network.Containers??{}).some((id)=>id!==databaseId&&!owned.some((r)=>r.id===id)))throw Error('Red app tiene consumidor ajeno.');
    const publicNetwork=JSON.parse(docker(['network','inspect',ingress]))[0];
    if(publicNetwork.Id!==ingressId||publicNetwork.Labels?.['com.pokescan.inf03.run']!==runId||publicNetwork.Labels?.['com.pokescan.inf03.role']!=='app-ingress'||Object.keys(publicNetwork.Containers??{}).some((id)=>!owned.some((r)=>r.role==='app-frontend'&&r.id===id)))throw Error('Ingress app tiene consumidor ajeno.');
  };
  try {
    ingressId=docker(['network','create','--label',`com.pokescan.inf03.run=${runId}`,'--label','com.pokescan.inf03.role=app-ingress',ingress]).trim();registerNetwork(ingress);
    create('app-redis',redisImage,['--network-alias','inf03-app-redis','--tmpfs','/data']);
    create('app-backend',images.backend.Id,['--network-alias','inf03-app-backend','--env-file',envFile]);
    create('app-frontend',images.frontend.Id,['--network-alias','inf03-app-web','-e','API_INTERNAL_URL=http://inf03-app-backend:3001/api','-p',`127.0.0.1:${port}:3000`]);
    verifyOwned();report.isolation={apiRedisOnlyInternalNetwork:true,frontendOwnIngress:true,noApiPublished:true,webLoopbackPort:port,imagesReused:true};
    const deadline=Date.now()+40_000;
    let ready;
    while(Date.now()<deadline){if(!inspect(`${runId}-app-backend`).State.Running)throw Error('Backend fixture terminó durante arranque.');try{ready=request({path:'/ready'});if(ready.status===200&&parse(ready).detail.redis.state==='ready')break;}catch{}await new Promise((resolve)=>setTimeout(resolve,150));}
    const health=request({path:'/health'}),readiness=parse(ready);
    check('readiness-and-liveness',health.status===200&&parse(health).status==='ok'&&ready.status===200&&ready.cache==='no-store'&&readiness.status==='ready'&&!readiness.degraded&&readiness.detail.database.state==='ready'&&readiness.detail.scanner.state==='disabled'&&readiness.detail.redis.state==='ready'
      &&equalKeys(readiness,['status','degraded','detail'])&&equalKeys(readiness.detail,['database','scanner','redis'])&&equalKeys(readiness.detail.database,['state'])&&equalKeys(readiness.detail.scanner,['state','busy'])&&equalKeys(readiness.detail.redis,['state']));
    report.readiness=readiness;
    check('unauthenticated-401',request({path:`/collections/${APP_FIXTURE.collection}/items`}).status===401);
    const items=parse(request({path:`/collections/${APP_FIXTURE.collection}/items`,user:APP_FIXTURE.owner})).data;
    check('restored-uuid-quantity-attributes',Array.isArray(items)&&items.length===2&&items.some((item)=>item.id===APP_FIXTURE.item&&item.variant==='normal'&&item.condition==='NM'&&item.quantity===2&&item.notes===APP_FIXTURE.privateNote)&&items.some((item)=>item.id==='66666666-6666-4666-8666-666666666666'&&item.variant==='holofoil'&&item.condition==='LP'&&item.quantity===3&&item.isForTrade===true)&&pairs()==='holofoil:LP:3,normal:NM:2');
    const snapshot=activeSnapshot();
    for(const q of [{path:`/collections/${APP_FIXTURE.collection}/items`},{path:`/collections/${APP_FIXTURE.collection}/items`,method:'POST',body:fixture.payload,key:randomUUID()},{path:`/share/${APP_FIXTURE.share}`,method:'PATCH',body:{isActive:false}},{path:`/share/${APP_FIXTURE.share}`,method:'DELETE'}])check(`foreign-${q.method??'GET'}-${q.path.includes('/share/')?'share':'collection'}-404`,request({...q,user:APP_FIXTURE.other}).status===404);
    check('foreign-requests-did-not-mutate',activeSnapshot()===snapshot);
    const replay=request({path:`/collections/${APP_FIXTURE.collection}/items`,method:'POST',body:fixture.payload,key:fixture.key,user:APP_FIXTURE.owner});
    check('restored-operation-replay-no-increment',replay.status===201&&parse(replay).id===APP_FIXTURE.item&&parse(replay).quantity===2&&pairs()==='holofoil:LP:3,normal:NM:2');
    check('restored-operation-payload-conflict',request({path:`/collections/${APP_FIXTURE.collection}/items`,method:'POST',body:{...fixture.payload,quantity:1},key:fixture.key,user:APP_FIXTURE.owner}).status===409&&pairs()==='holofoil:LP:3,normal:NM:2');
    const nextKey=randomUUID(),nextPayload={...fixture.payload,quantity:1};
    const next=request({path:`/collections/${APP_FIXTURE.collection}/items`,method:'POST',body:nextPayload,key:nextKey,user:APP_FIXTURE.owner});
    check('new-intention-increments-once',next.status===201&&parse(next).id===APP_FIXTURE.item&&parse(next).quantity===3&&pairs()==='holofoil:LP:3,normal:NM:3');
    check('restored-and-new-operation-sql',sql(destination.container,destination.db,`SELECT count(*) FROM collection_item_add_operations WHERE "userId"='${APP_FIXTURE.owner}' AND ((key='${fixture.key}' AND "payloadHash"='${fixture.hash}') OR (key='${nextKey}' AND "payloadHash"='${operationHash(nextPayload)}')) AND "resultItemId"='${APP_FIXTURE.item}';`,destination.user).trim()==='2');
    const publicPath=`/s/${APP_FIXTURE.slug}`,webPath=`/share/${APP_FIXTURE.slug}`;
    const publicResponse=request({path:publicPath});assertPublicPayload(parse(publicResponse));
    check('public-allowlist-no-store-and-totals',publicResponse.status===200&&publicResponse.cache==='no-store'&&parse(publicResponse).stats.totalCards===6&&parse(publicResponse).stats.totalGroups===2&&parse(publicResponse).stats.totalValueUsd===null);
    const webDeadline=Date.now()+30_000;let web;
    while(Date.now()<webDeadline){try{web=request({path:webPath,web:true});if(web.status===200)break;}catch{}await new Promise((resolve)=>setTimeout(resolve,150));}
    assertNoPrivateSSR(web.text,'inf03-app-backend:3001',true);check('real-share-ssr-private-base-noindex',web.status===200);
    const card=request({path:`/carta/${APP_FIXTURE.card}`,web:true});
    check('real-card-ssr-private-base',card.status===200&&card.text.includes('Synthetic Fixture Card')&&!card.text.includes('inf03-app-backend:3001'));
    const loopback=await fetch(`http://127.0.0.1:${port}${webPath}`,{signal:AbortSignal.timeout(10000)});assertNoPrivateSSR(await loopback.text(),'inf03-app-backend:3001',true);check('real-loopback-web',loopback.status===200);
    const staticCode="const fs=require('node:fs'),p=require('node:path');let files=0;function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const n=p.join(d,f.name);if(f.isDirectory())walk(n);else {if(/inf03-app-backend:3001|backend:3001|127\\.0\\.0\\.1:1\\/api|API_INTERNAL_URL/.test(fs.readFileSync(n).toString()))throw Error('private-host');files++;}}}walk('/app/.next/static');console.log(JSON.stringify({files,privateHostFound:false}));";
    report.browserStatic=JSON.parse(docker(['exec',`${runId}-app-frontend`,'node','-e',staticCode]));check('browser-static-no-private-host',report.browserStatic.files>0);
    request({path:publicPath});request({path:webPath,web:true});
    const redisName=`${runId}-app-redis`;
    const keys=docker(['exec',redisName,'redis-cli','--raw','KEYS',`share:public-v2:*:${APP_FIXTURE.slug}`]).trim();
    // El key se inspecciona sin persistir el payload; el servicio valida DB antes de leerlo.
    check('public-cache-warmed',keys.split('\n').filter(Boolean).length===1);
    check('owner-revoke-204',request({path:`/share/${APP_FIXTURE.share}`,method:'DELETE',user:APP_FIXTURE.owner}).status===204);
    const absent=request({path:publicPath});check('revoked-api-404-no-store',absent.status===404&&absent.cache==='no-store');
    const absentWeb=request({path:webPath,web:true});assertNoPrivateSSR(absentWeb.text,'inf03-app-backend:3001',false);check('revoked-ssr-no-protected-data',absentWeb.status===200||absentWeb.status===404);
    check('owner-reactivates-200',request({path:`/share/${APP_FIXTURE.share}`,method:'PATCH',body:{isActive:true},user:APP_FIXTURE.owner}).status===200);
    const active=request({path:publicPath});assertPublicPayload(parse(active));assertNoPrivateSSR(request({path:webPath,web:true}).text,'inf03-app-backend:3001',true);check('reactivated-api-and-ssr',active.status===200);
    check('expiry-cache-hot-before',docker(['exec',redisName,'redis-cli','EXISTS',keys]).trim()==='1');
    sql(destination.container,destination.db,`UPDATE share_links SET "expiresAt"=now()-interval '1 second' WHERE id='${APP_FIXTURE.share}' AND "userId"='${APP_FIXTURE.owner}';`,destination.user);
    const expired=request({path:publicPath});check('expired-api-404-no-store-cache-still-hot',expired.status===404&&expired.cache==='no-store'&&docker(['exec',redisName,'redis-cli','EXISTS',keys]).trim()==='1');
    const expiredWeb=request({path:webPath,web:true});assertNoPrivateSSR(expiredWeb.text,'inf03-app-backend:3001',false);check('expired-ssr-no-protected-data',expiredWeb.status===200||expiredWeb.status===404);
    check('final-quantity-operation-and-prices',pairs()==='holofoil:LP:3,normal:NM:3'&&sql(destination.container,destination.db,'SELECT count(*) FROM card_prices;',destination.user).trim()==='0');
    report.finalQuantities={normalNM:3,holofoilLP:3};report.priceRows=0;
    report.pendingPriceJobs=Number(sql(destination.container,destination.db,"SELECT count(*) FROM price_refresh_jobs WHERE status='pending';",destination.user).trim());
    report.executedPriceJobs=Number(sql(destination.container,destination.db,"SELECT count(*) FROM price_refresh_jobs WHERE status<>'pending';",destination.user).trim());check('no-provider-worker-execution',report.executedPriceJobs===0);
    verifyOwned();report.completed=true;
  } catch(error) {
    report.failure=error instanceof Error?error.message.split('\n')[0].slice(0,180):'Gate app falló.';
    report.containerDiagnostics=owned.map((resource)=>{try{const info=inspect(resource.name);const logs=spawnSync('docker',['logs','--tail','100',resource.id],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});const names=['PrismaClientInitializationError','PrismaClientKnownRequestError','P1000','P1001','P2021','Error','ENOENT','EACCES','ERR_MODULE_NOT_FOUND','ECONNREFUSED'];return {role:resource.role,running:info.State.Running,exit:info.State.ExitCode,errorClasses:names.filter((name)=>(logs.stdout+logs.stderr).includes(name))};}catch{return {role:resource.role,diagnosticUnavailable:true};}});
    throw error;
  } finally {
    // No ampliar los permisos del restore para los consumidores; retirarlos antes del cleanup PG.
    const errors=[];
    for(const resource of owned.reverse())try{const info=inspect(resource.name);if(info.Id!==resource.id)throw Error('id');verifyAppContainer(info,{runId,role:resource.role,image:resource.image,network:destination.network,port,ingress});docker(['rm','--force',resource.id]);}catch{errors.push(`No se retiró ${resource.role}.`);}
    for(const resource of owned){const exists=spawnSync('docker',['inspect',resource.id],{stdio:'ignore',timeout:15000});if(exists.status!==1)errors.push(`No se acreditó ausencia ${resource.role}.`);}
    try{if(assertResource(runId,destination.container,'destination')!==databaseId)throw Error('id');}catch{errors.push('La red destino no volvió al aislamiento exclusivo.');}
    if(ingressId)try{const network=JSON.parse(docker(['network','inspect',ingress]))[0];if(network.Id!==ingressId||network.Labels?.['com.pokescan.inf03.run']!==runId||network.Labels?.['com.pokescan.inf03.role']!=='app-ingress'||Object.keys(network.Containers??{}).length)throw Error('ingress');docker(['network','rm',ingressId]);if(spawnSync('docker',['network','inspect',ingressId],{stdio:'ignore',timeout:15000}).status!==1)throw Error('absent');}catch{errors.push('No se retiró ingress propio.');}
    report.cleanup={complete:errors.length===0,errors};
    await writeFile(path.join(projectDir,'app-flow-result.json'),JSON.stringify(report)+'\n',{mode:0o600});
    if(errors.length)throw Error('Cleanup app incompleto; conservá contexto privado del run.');
  }
  return report;
}
