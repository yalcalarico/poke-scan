import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const folder=path.dirname(new URL(import.meta.url).pathname),root='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app';
const own=JSON.parse(fs.readFileSync(path.join(folder,'db-owner.json'),'utf8'));
const evidence=path.join(root,'docs/plans/lanzamiento-2026-10-07/RESULTADOS/RESEND-simulado-evidencia');fs.mkdirSync(evidence,{recursive:true});
const req=createRequire(path.join(root,'backend/package.json')),web='http://127.0.0.1:3000',api='http://127.0.0.1:3001/api';
const key=randomBytes(32).toString('hex'),oldPassword=randomBytes(14).toString('base64url'),newPassword=randomBytes(14).toString('base64url');
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:`postgresql://pokemon:pokemon@127.0.0.1:55432/${own.database}`,REDIS_URL:`redis://127.0.0.1:${own.redis.port}`,JWT_SECRET:randomBytes(40).toString('hex'),JWT_REFRESH_SECRET:randomBytes(40).toString('hex'),RECOVERY_IDENTIFIER_HMAC_KEY:randomBytes(40).toString('hex'),CORS_ORIGINS:web,FRONTEND_URL:web,RECOVERY_MAIL_MODE:'disabled',PRICE_QUEUE_ENABLED:'false',ENABLE_CATALOG_SYNC_CRON:'false',ENABLE_PRICE_BACKFILL_CRON:'false',ENABLE_RETENTION_CRON:'false',SCANNER_VISUAL_ENABLED:'0',CURRENCY_ARS_ENABLED:'false'});
const nativeFetch=globalThis.fetch;let blocked=0,mapped=0,mode='ok',requests=[],inbox=[],redirectHits=0,closed=0;const checks=[];let app,prisma,next,browser,provider,exit=0,phase='bootstrap';
globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)){blocked++;return Promise.reject(new Error('EXTERNAL_BLOCKED'));}return nativeFetch(input,init);};
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2)+'\n');
const record=(id,pass)=>{checks.push({id,pass:Boolean(pass)});save('runtime-checks.json',checks);if(!pass)throw new Error('FAILED_'+id);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,ms=5000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(40);}throw new Error('WAIT_TIMEOUT');}
async function post(route,body,headers={}){const r=await fetch(api+route,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Session-Request':'1',Origin:web,...headers},body:JSON.stringify(body)});return{status:r.status,body:await r.json(),headers:r.headers};}
async function resetRates(){record('owned-database-before-fixture-reset-'+checks.length,(await prisma.$queryRawUnsafe('SELECT current_database() AS name'))[0].name===own.database);await prisma.recoveryRateLimitHit.deleteMany();}
function tokenOf(payload){const link=payload.text.split('\n').find(x=>x.startsWith('https://'));return new URL(link).hash.slice('#token='.length);}
try{
 const {Test}=req('@nestjs/testing'),{ValidationPipe,Logger}=req('@nestjs/common');Logger.overrideLogger(false);
 const {AppModule}=await import(pathToFileURL(path.join(root,'backend/dist/app.module.js')));
 const {RECOVERY_MAIL_PORT}=await import(pathToFileURL(path.join(root,'backend/dist/modules/auth/recovery-mail.port.js')));
 const {ResendRecoveryMailPort,createResendRecoveryMailPort}=await import(pathToFileURL(path.join(root,'backend/dist/modules/auth/resend-recovery-mail.port.js')));
 const settings={apiKey:key,from:'PokéScan <recovery@example.invalid>',frontendOrigin:'https://pokescan.example.invalid'};
 record('default-factory-disabled',!createResendRecoveryMailPort({get:()=>undefined}).available);
 provider=createServer(async(req,res)=>{
   if(req.url==='/redirect-target'){redirectHits++;res.end('{}');return;}
   if(req.method!=='POST'||req.url!=='/emails'||req.headers.authorization!==`Bearer ${key}`){res.writeHead(400);res.end('{}');return;}
   let raw='';for await(const c of req){raw+=c;if(raw.length>16000){res.destroy();return;}}
   const payload=JSON.parse(raw);raw='';inbox.push(payload);requests.push({mode,fields:Object.keys(payload).sort()});
   res.on('close',()=>{closed++;});res.setHeader('Content-Type','application/json');
   if(mode==='hang')return;
   if(mode==='redirect'){res.writeHead(302,{Location:'http://127.0.0.1:56522/redirect-target'});res.end('{"id":"simulated"}');return;}
   if(mode==='lost'){res.destroy();return;}
   if(mode==='oversize'){res.end('x'.repeat(6000));return;}
   if(mode==='badjson'){res.end('not-json');return;}
   if(mode==='429'||mode==='500'){res.writeHead(Number(mode));res.end('{"message":"simulated rejection"}');return;}
   res.end('{"id":"simulated-provider-acceptance"}');
 });await new Promise(r=>provider.listen(56522,'127.0.0.1',r));
 const transport=(input,init)=>{if(String(input)!=='https://api.resend.com/emails')throw new Error('ENDPOINT_MISMATCH');mapped++;return fetch('http://127.0.0.1:56522/emails',init);};
 const mail=new ResendRecoveryMailPort(settings,transport);
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(RECOVERY_MAIL_PORT).useValue(mail).compile();
 app=module.createNestApplication({logger:false});app.use(req('helmet')());app.setGlobalPrefix('api');app.enableCors({origin:[web],credentials:true});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(3001,'127.0.0.1');
 const {PrismaService}=await import(pathToFileURL(path.join(root,'backend/dist/prisma/prisma.service.js')));prisma=app.get(PrismaService);
 record('owned-database-marker',own.marker.includes(own.runId)&&(await prisma.$queryRawUnsafe('SELECT current_database() AS name'))[0].name===own.database);
 const suffix=randomBytes(5).toString('hex'),email=`resend-${suffix}@example.invalid`,username='resend'+suffix;
 const reg=await post('/auth/register',{email,username,displayName:'Ensayo simulado',password:oldPassword});record('compiled-register',reg.status===201);
 const first=await post('/auth/password-recovery-requests',{email});record('compiled-request-202-no-store',first.status===202&&first.headers.get('cache-control').includes('no-store'));
 await waitFor(()=>inbox.length===1);record('simulator-native-http-received',mapped===1&&requests.length===1);
 let payload=inbox.shift(),token=tokenOf(payload);record('payload-allowlist-no-userid',JSON.stringify(Object.keys(payload).sort())===JSON.stringify(['from','subject','text','to'])&&!payload.text.includes(reg.body.user.id));
 const link=new URL(payload.text.split('\n').find(x=>x.startsWith('https://')));record('link-fragment-only',link.pathname==='/recuperar'&&!link.search&&/^#token=[A-Za-z0-9_-]{43}$/.test(link.hash));
 const row=await prisma.passwordRecoveryToken.findUnique({where:{tokenHash:createHash('sha256').update(token).digest('hex')}});record('pg-hash-only-valid-token',Boolean(row)&&row.tokenHash!==token&&!JSON.stringify(row).includes(token));payload=null;
 phase='next-start';const nextLog=fs.openSync(path.join(folder,'runtime-next.log'),'w');next=spawn('node',['--import','/private/tmp/local-app-qa-20261010/no-provider-fetch.mjs',path.join(root,'frontend/node_modules/next/dist/bin/next'),'start',path.join(root,'frontend'),'--hostname','127.0.0.1','--port','3000'],{cwd:path.join(root,'frontend'),env:{...process.env,NODE_ENV:'production',PORT:'3000',HOSTNAME:'127.0.0.1',API_INTERNAL_URL:api},stdio:['ignore',nextLog,nextLog]});fs.closeSync(nextLog);
 await waitFor(async()=>{try{return(await fetch(web+'/recuperar')).status===200;}catch{return false;}},15000);
 phase='browser-launch';const pwReq=createRequire('/Users/ysmaelalcalarico/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');const {chromium}=pwReq('playwright');browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'});await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();return route.continue();});
 phase='recovery-form';const page=await context.newPage();await page.goto(web+'/recuperar#token='+token);await page.getByRole('heading',{name:'Elegí tu nueva contraseña'}).waitFor();
 record('next-captures-simulated-mail-token',await page.evaluate(()=>location.hash===''&&window.__pcsRecoveryManager?.snapshot().mode==='link'));
 await page.screenshot({path:path.join(evidence,'recuperacion-enlace-listo.jpg'),type:'jpeg',fullPage:true});
 phase='recovery-submit';await page.locator('#recovery-password').fill(newPassword);await page.locator('#recovery-confirmation').fill(newPassword);await page.getByRole('button',{name:'Cambiar contraseña',exact:true}).click();await page.getByRole('heading',{name:'Cambiaste tu contraseña'}).waitFor();
 record('real-ui-password-changed',await page.evaluate(()=>window.__pcsRecoveryManager?.snapshot().token===null));await page.screenshot({path:path.join(evidence,'recuperacion-completada.jpg'),type:'jpeg',fullPage:true});
 phase='login-revocation';const replay=await post('/auth/password-recoveries',{token,newPassword});record('replay-rejected',replay.status===400);token=null;
 const oldLogin=await post('/auth/login',{email,password:oldPassword}),newLogin=await post('/auth/login',{email,password:newPassword});record('old-password-rejected-new-accepted',oldLogin.status===401&&newLogin.status===200);
 const refresh=reg.headers.get('set-cookie')?.split(';')[0];record('pre-reset-refresh-revoked',(await post('/auth/refresh',{},refresh?{Cookie:refresh}:{})).status===401);
 await context.close();
 const seed=await prisma.user.findUnique({where:{id:reg.body.user.id}});
 let counter=0;
 for(const scenario of ['429','500','redirect','badjson','oversize','lost','hang']){
   phase='scenario-'+scenario;await resetRates();mode=scenario;const fixture=await prisma.user.create({data:{email:`resend-case-${suffix}-${counter}@example.invalid`,username:`rs${suffix}${counter++}`,displayName:'Ensayo simulado',passwordHash:seed.passwordHash}});const before=requests.length;
   const result=await post('/auth/password-recovery-requests',{email:fixture.email});record('generic-202-'+scenario,result.status===202&&result.body.message===first.body.message);
   await waitFor(()=>requests.length===before+1);let uncertain=inbox.shift();const candidate=tokenOf(uncertain);uncertain=null;await sleep(2200);
   record('one-handoff-no-replay-'+scenario,requests.length===before+1);const remaining=await prisma.passwordRecoveryToken.findUnique({where:{tokenHash:createHash('sha256').update(candidate).digest('hex')}});record('uncertain-token-not-invalidated-'+scenario,Boolean(remaining)&&!remaining.revokedAt);
   if(scenario==='lost'){await resetRates();record('lost-response-token-still-consumable',(await post('/auth/password-recoveries',{token:candidate,newPassword})).status===200);}
 }
 record('redirect-never-followed',redirectHits===0);record('external-network-never-used',blocked===0&&mapped===requests.length);
 record('http-connections-closed',closed===requests.length);
 phase='drain';await sleep(2200);const {PasswordRecoveryService}=await import(pathToFileURL(path.join(root,'backend/dist/modules/auth/password-recovery.service.js')));const recovery=app.get(PasswordRecoveryService);await app.close();app=null;record('recovery-drained',recovery.drainStatus().pendingJobs===0&&recovery.drainStatus().tickets===0&&!recovery.drainStatus().quarantined);
 save('summary.json',{scope:'Compiled Nest + Next + native HTTP Resend simulator + own PostgreSQL/Redis; no external sending',checks:checks.length,passed:checks.every(x=>x.pass),mappedRequests:mapped,externalRequests:0,realProviderConfigured:false,realDeliverabilityAccredited:false,screenshotsSafe:true});
}catch{exit=1;save('runtime-failure.json',{phase,checksCompleted:checks.length});}
finally{
 inbox=[];requests=[];await browser?.close();if(app)await app.close();if(next){next.kill('SIGTERM');await new Promise(r=>{if(next.exitCode!==null)r();else{next.once('exit',r);setTimeout(()=>{next.kill('SIGKILL');r();},5000).unref();}});}if(provider){provider.closeAllConnections();await new Promise(r=>provider.close(r));}
 save('runtime-resource-cleanup.json',{appClosed:true,browserClosed:true,nextStopped:!next||next.exitCode!==null||next.signalCode!==null,providerClosed:!provider||!provider.listening,exitCode:exit});
}
console.log(JSON.stringify({exitCode:exit,phase,checks:checks.length,passed:checks.filter(x=>x.pass).length}));process.exit(exit);
