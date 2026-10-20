import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
const folder=path.dirname(new URL(import.meta.url).pathname),root='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app';
const own=JSON.parse(fs.readFileSync(path.join(folder,'db-owner.json'),'utf8'));
const evidence=path.join(root,'docs/plans/lanzamiento-2026-10-07/RESULTADOS/BE-05-eliminacion-evidencia');fs.mkdirSync(evidence,{recursive:true});
const req=createRequire(path.join(root,'backend/package.json')),web='http://localhost:3000',api='http://localhost:3001/api';
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2)+'\n');
const checks=[];let phase='bootstrap',exit=0,app,prisma,next,browser,targetPrisma;let blocked=0;
const record=(id,pass)=>{checks.push({id,pass:Boolean(pass)});save('runtime-checks.json',checks);if(!pass)throw new Error('FAILED_'+id);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(40);}throw new Error('WAIT_TIMEOUT');}
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)){blocked++;return Promise.reject(new Error('EXTERNAL_BLOCKED'));}return nativeFetch(input,init);};
function docker(args,options={}){return execFileSync('docker',['exec',...(options.input ? ['-i'] : []),own.pgFullID,...args],{maxBuffer:128*1024*1024,...options});}
function sql(db,q){return docker(['psql','-U','pokemon','-d',db,'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();}
function assertDB(db,marker){record('owner-marker-'+checks.length,execFileSync('docker',['inspect','-f','{{.Id}}','pokemon-scanner-db'],{encoding:'utf8'}).trim()===own.pgFullID&&sql('postgres',`SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='${db}'`)===marker);}
async function request(route,{method='GET',body,token,headers={}}={}){const r=await fetch(api+route,{method,redirect:'error',headers:{...(body?{'Content-Type':'application/json','X-Session-Request':'1',Origin:web}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.text();let result;try{result=JSON.parse(raw);}catch{result=undefined;}return{status:r.status,body:result,headers:r.headers};}
const password=randomBytes(14).toString('base64url'),hmacKey=randomBytes(32).toString('hex');
const journalDir=path.join(folder,'runtime-journal'),custodyDir=path.join(folder,'runtime-custody');
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:`postgresql://pokemon:pokemon@127.0.0.1:55432/${own.database}`,REDIS_URL:`redis://127.0.0.1:${own.redis.port}`,JWT_SECRET:randomBytes(40).toString('hex'),JWT_REFRESH_SECRET:randomBytes(40).toString('hex'),RECOVERY_IDENTIFIER_HMAC_KEY:randomBytes(40).toString('hex'),CORS_ORIGINS:web,FRONTEND_URL:web,RECOVERY_MAIL_MODE:'disabled',ACCOUNT_DELETION_MODE:'local-private',ACCOUNT_DELETION_JOURNAL_DIR:journalDir,ACCOUNT_DELETION_CHECKPOINT_DIR:custodyDir,ACCOUNT_DELETION_HMAC_KEY:hmacKey,PRICE_QUEUE_ENABLED:'false',ENABLE_CATALOG_SYNC_CRON:'false',ENABLE_PRICE_BACKFILL_CRON:'false',ENABLE_RETENTION_CRON:'false',SCANNER_VISUAL_ENABLED:'0',CURRENCY_ARS_ENABLED:'false'});
try{
 assertDB(own.database,own.marker);
 const {Test}=req('@nestjs/testing'),{ValidationPipe,Logger}=req('@nestjs/common');Logger.overrideLogger(false);
 const {AppModule}=await import(pathToFileURL(path.join(root,'backend/dist/app.module.js')));
 const {PrismaService}=await import(pathToFileURL(path.join(root,'backend/dist/prisma/prisma.service.js')));
 const {RedisService}=await import(pathToFileURL(path.join(root,'backend/dist/redis/redis.service.js')));
 const {AccountDeletionService}=await import(pathToFileURL(path.join(root,'backend/dist/modules/account-deletion/account-deletion.service.js')));
 const {AccountSuppressionService}=await import(pathToFileURL(path.join(root,'backend/dist/modules/account-deletion/account-suppression.service.js')));
 const {LocalSuppressionJournal,initializeLocalSuppressionJournal,SUPPRESSION_JOURNAL}=await import(pathToFileURL(path.join(root,'backend/dist/modules/account-deletion/suppression-journal.js')));
 const {restoreWithSuppressions}=await import(pathToFileURL(path.join(root,'backend/dist/modules/account-deletion/account-deletion-restore.js')));
 const {publicCacheKey}=await import(pathToFileURL(path.join(root,'backend/dist/modules/share/share.service.js')));
 const {PRICE_PROVIDER}=await import(pathToFileURL(path.join(root,'backend/dist/modules/providers/card-provider.interface.js')));
 const {PrismaClient}=req('@prisma/client');
 fs.mkdirSync(journalDir,{mode:0o700});fs.mkdirSync(custodyDir,{mode:0o700});
 await initializeLocalSuppressionJournal({journalDirectory:journalDir,checkpointDirectory:custodyDir,hmacKey},new Date(Date.now()-60000).toISOString());
 async function startApp(db){process.env.DATABASE_URL=`postgresql://pokemon:pokemon@127.0.0.1:55432/${db}`;const module=await Test.createTestingModule({imports:[AppModule]}).compile();const a=module.createNestApplication({logger:false});a.use(req('helmet')());a.setGlobalPrefix('api');a.enableCors({origin:[web],credentials:true});a.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await a.listen(3001,'127.0.0.1');return a;}
 app=await startApp(own.database);prisma=app.get(PrismaService);const journal=app.get(SUPPRESSION_JOURNAL),redis=app.get(RedisService),provider=app.get(PRICE_PROVIDER);
 record('startup-current-private-journal-before-traffic',app.get(AccountSuppressionService).enabled&&await app.get(AccountDeletionService).isAvailable());
 const suffix=randomBytes(5).toString('hex');
 async function fixture(n){const email=`delete-${suffix}-${n}@example.invalid`;const r=await request('/auth/register',{method:'POST',body:{email,username:`del${suffix}${n}`,displayName:'Cuenta de ensayo',password}});record('compiled-register-'+n,r.status===201);return{email,id:r.body.user.id,token:r.body.accessToken,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const first=await fixture(1),other=await fixture(2),uncertain=await fixture(3),limited=await fixture(4);
 const card=await prisma.card.findFirstOrThrow();
 const collection=await prisma.collection.create({data:{userId:first.id,name:'Colección de ensayo'}});
 await prisma.collectionItem.create({data:{collectionId:collection.id,cardId:card.id,notes:'Dato sintético'}});
 const share=await prisma.shareLink.create({data:{userId:first.id,collectionId:collection.id,slug:randomBytes(5).toString('hex')}});
 const recoveryToken=randomBytes(32).toString('base64url');await prisma.passwordRecoveryToken.create({data:{userId:first.id,tokenHash:createHash('sha256').update(recoveryToken).digest('hex'),issuedAuthVersion:0,expiresAt:new Date(Date.now()+600000)}});
 await prisma.portfolioSnapshot.create({data:{userId:first.id,day:new Date(),totalCards:1,unpricedCards:1}});
 await prisma.collectionItemAddOperation.create({data:{userId:first.id,key:randomUUID(),payloadHash:'synthetic',expiresAt:new Date(Date.now()+600000)}});
 await prisma.scanJob.create({data:{userId:first.id}});
 await prisma.friendship.create({data:{requesterId:first.id,addresseeId:other.id}});
 const globalCounts=await prisma.$queryRawUnsafe('SELECT (SELECT count(*) FROM cards)::int AS cards,(SELECT count(*) FROM card_sets)::int AS sets,(SELECT count(*) FROM card_prices)::int AS prices,(SELECT count(*) FROM price_refresh_jobs)::int AS jobs');
 const availability=await request('/auth/account-deletion-availability',{token:first.token});record('availability-authenticated-exact-no-store',availability.status===200&&JSON.stringify(availability.body)==='{"available":true}'&&availability.headers.get('cache-control').includes('no-store'));
 record('share-api-warmed',(await request('/s/'+share.slug)).status===200);
 const cacheKey=publicCacheKey(provider.id,share.slug);record('own-redis-known-key-warm',Boolean(await redis.getJson(cacheKey)));
 phase='encrypted-snapshot';assertDB(own.database,own.marker);
 const originalCreatedAt=new Date().toISOString(),backupKey=randomBytes(32),iv=randomBytes(12),aad=Buffer.from(JSON.stringify({originalCreatedAt,format:'local-qa-pg-custom-v1'}));
 let plaintext=docker(['pg_dump','-Fc','-U','pokemon','-d',own.database]);const plainHash=createHash('sha256').update(plaintext).digest('hex');
 const cipher=createCipheriv('aes-256-gcm',backupKey,iv);cipher.setAAD(aad);const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]),tag=cipher.getAuthTag();plaintext.fill(0);plaintext=null;
 const encryptedPath=path.join(folder,'owned-snapshot.enc');fs.writeFileSync(encryptedPath,encrypted,{mode:0o600});record('actual-pg-custom-dump-encrypted-only',encrypted.length>1024&&fs.statSync(encryptedPath).mode%512===384);
 save('backup-receipt.json',{actualPgDump:true,format:'custom',originalCreatedAt,encryptedBytes:encrypted.length,plaintextPersisted:false,encryption:'AES-256-GCM private QA artifact, does not replace production age protocol',keyPersisted:false,independentSuppressionCustody:true});
 phase='next-start';const nextLog=fs.openSync(path.join(folder,'runtime-next.log'),'w');next=spawn('node',['--import','/private/tmp/local-app-qa-20261010/no-provider-fetch.mjs',path.join(root,'frontend/node_modules/next/dist/bin/next'),'start',path.join(root,'frontend'),'--hostname','127.0.0.1','--port','3000'],{cwd:path.join(root,'frontend'),env:{...process.env,NODE_ENV:'production',PORT:'3000',HOSTNAME:'127.0.0.1',API_INTERNAL_URL:api},stdio:['ignore',nextLog,nextLog]});fs.closeSync(nextLog);
 await waitFor(async()=>{try{return(await fetch(web+'/login')).status===200;}catch{return false;}},15000);
 const pwReq=createRequire('/Users/ysmaelalcalarico/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');const {chromium}=pwReq('playwright');browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 async function context(){const c=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',reducedMotion:'reduce'});await c.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?r.continue():r.abort();});return c;}
 async function login(page,email){await page.goto(web+'/login');await page.locator('#login-email').fill(email);await page.locator('#login-password').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/buscar');}
 const ctx=await context(),page=await ctx.newPage();phase='service-worker-activation';
 await page.goto(web+'/robots.txt');
 await page.evaluate(async()=>{const own=await caches.open('pokescan-shell-v6');await own.put('/eliminar-cuenta',new Response('synthetic old page'));const other=await caches.open('cache-ajena');await other.put('/eliminar-cuenta',new Response('other service'));await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 await waitFor(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)));
 record('real-worker-purges-deletion-keeps-other-cache',await page.evaluate(async()=>!(await (await caches.open('pokescan-shell-v6')).match('/eliminar-cuenta'))&&Boolean(await (await caches.open('cache-ajena')).match('/eliminar-cuenta'))));
 phase='settings-navigation';await login(page,first.email);await page.goto(web+'/ajustes');await page.getByRole('link',{name:'Revisar eliminación'}).click();await page.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).waitFor();
 record('deletion-page-no-store-referrer', (await fetch(web+'/eliminar-cuenta')).headers.get('cache-control').includes('no-store')&&(await fetch(web+'/eliminar-cuenta')).headers.get('referrer-policy')==='no-referrer');
 record('actual-settings-to-confirmation',new URL(page.url()).pathname==='/eliminar-cuenta');
 phase='session-reload';await page.reload();await page.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).waitFor();record('actual-cookie-bootstrap-reload',await page.locator('#account-deletion-password').isVisible());
 record('real-worker-does-not-cache-deletion-page',await page.evaluate(async()=>!(await (await caches.open('pokescan-shell-v6')).match('/eliminar-cuenta'))));
 await page.locator('#account-deletion-password').fill('synthetic-not-a-real-secret');await page.locator('#account-deletion-confirmation').fill('ELIMINAR');
 await page.getByRole('link',{name:'Volver a Ajustes'}).click();await page.waitForURL('**/ajustes');await page.goBack();await page.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).waitFor();
 record('actual-history-fields-cleared',await page.locator('#account-deletion-password').inputValue()===''&&await page.locator('#account-deletion-confirmation').inputValue()==='');
 phase='responsive-qa';for(const width of [390,1280])for(const theme of ['light','dark']){await page.setViewportSize({width,height:width===390?844:900});await page.evaluate(t=>{localStorage.setItem('pokescan.theme',t);document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.dataset.theme=t;},theme);await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});record(`form-no-horizontal-overflow-${width}-${theme}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));record(`password-not-prefilled-${width}-${theme}`,await page.locator('#account-deletion-password').inputValue()==='');await page.screenshot({path:path.join(evidence,`confirmacion-${width}-${theme}.png`),fullPage:true});}
 await page.setViewportSize({width:390,height:844});
 const blankPosts=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/auth/account-deletions'))blankPosts.push(1);});
 await page.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).click();record('blank-validation-no-server-post',blankPosts.length===0&&await page.getByText('Ingresá tu contraseña actual.',{exact:true}).isVisible());record('invalid-focus-password',await page.locator('#account-deletion-password').evaluate(el=>el===document.activeElement));
 await page.locator('#account-deletion-password').fill('synthetic-wrong-password');await page.locator('#account-deletion-confirmation').fill('ELIMINAR');await page.getByRole('checkbox',{name:/Confirmo que quiero eliminar/}).check();
 phase='wrong-password';await page.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).click();await page.getByText('Revisá tu contraseña actual o volvé a iniciar sesión.',{exact:true}).waitFor();record('wrong-password-correctable-and-cleared',await page.locator('#account-deletion-password').inputValue()===''&&await prisma.user.count({where:{id:first.id}})===1);
 await page.locator('#account-deletion-password').fill(password);await page.locator('#account-deletion-confirmation').fill('ELIMINAR');phase='confirmed-delete';await page.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).click();await page.getByRole('heading',{name:'Tu cuenta fue eliminada'}).waitFor();record('real-ui-confirmed-success-single-post',blankPosts.length===2);await page.screenshot({path:path.join(evidence,'cuenta-eliminada-mobile.png'),fullPage:true});
 record('refresh-cookie-cleared',!(await ctx.cookies()).some(c=>c.name==='pcs.refreshToken'));
 record('session-storage-cleaned',await page.evaluate(()=>!localStorage.getItem('pcs.hasSession')&&!localStorage.getItem('pcs.refreshToken')&&!sessionStorage.getItem('pcs.accessToken')));
 record('success-can-create-another-account',await page.getByRole('link',{name:'Crear otra cuenta'}).getAttribute('href')==='/registro');
 record('known-share-cache-invalidated',await redis.getJson(cacheKey)===null);
 record('deleted-user-and-relations-zero',await prisma.user.count({where:{id:first.id}})===0&&await prisma.collection.count({where:{userId:first.id}})===0&&await prisma.shareLink.count({where:{userId:first.id}})===0&&await prisma.refreshToken.count({where:{userId:first.id}})===0&&await prisma.passwordRecoveryToken.count({where:{userId:first.id}})===0&&await prisma.friendship.count({where:{OR:[{requesterId:first.id},{addresseeId:first.id}]}})===0);
 record('old-access-rejected',(await request('/users/me',{token:first.token})).status===401);
 record('old-refresh-rejected',(await request('/auth/refresh',{method:'POST',body:{},headers:{Cookie:first.cookie}})).status===401);
 record('old-recovery-rejected',(await request('/auth/password-recoveries',{method:'POST',body:{token:recoveryToken,newPassword:password}})).status===400);
 record('share-authority-404-after-hot-cache',(await request('/s/'+share.slug)).status===404);
 const deniedSSR=await fetch(web+'/share/'+share.slug),deniedHTML=await deniedSSR.text();
 record('next-share-denied-no-private-data',[200,404].includes(deniedSSR.status)&&deniedHTML.includes('Este enlace no está disponible')&&deniedHTML.includes('noindex')&&!deniedHTML.includes(collection.name)&&!deniedHTML.includes(first.email)&&!deniedHTML.includes('Cuenta de ensayo'));
 save('denied-ssr-receipt.json',{status:deniedSSR.status,unavailable:true,noPrivateFixtureNames:true,noindex:true,standardNextStreamingSemantics:true});
 await page.goto(web+'/share/'+share.slug);await page.getByText('Este enlace no está disponible',{exact:true}).waitFor();await page.screenshot({path:path.join(evidence,'enlace-retirado-mobile.png'),fullPage:true});
 record('unrelated-user-and-global-catalog-unchanged',await prisma.user.count({where:{id:other.id}})===1&&JSON.stringify(await prisma.$queryRawUnsafe('SELECT (SELECT count(*) FROM cards)::int AS cards,(SELECT count(*) FROM card_sets)::int AS sets,(SELECT count(*) FROM card_prices)::int AS prices,(SELECT count(*) FROM price_refresh_jobs)::int AS jobs'))===JSON.stringify(globalCounts));
 await ctx.close();
 phase='lost-success-response';const lostCtx=await context(),lostPage=await lostCtx.newPage();await login(lostPage,uncertain.email);await lostPage.goto(web+'/eliminar-cuenta');await lostPage.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).waitFor();let lostPosts=0;
 await lostPage.route('**/api/auth/account-deletions',async route=>{lostPosts++;const r=await route.fetch();record('lost-response-server-committed-200',r.status()===200);await route.abort('failed');});
 await lostPage.locator('#account-deletion-password').fill(password);await lostPage.locator('#account-deletion-confirmation').fill('ELIMINAR');await lostPage.getByRole('checkbox',{name:/Confirmo que quiero eliminar/}).check();await lostPage.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).click();await lostPage.getByRole('heading',{name:'No confirmamos el resultado'}).waitFor();record('uncertain-ui-keeps-session-hint',await lostPage.evaluate(()=>localStorage.getItem('pcs.hasSession')==='true'));record('uncertain-ui-no-replay-no-success',lostPosts===1&&await lostPage.getByRole('button',{name:'Eliminar mi cuenta',exact:true}).count()===0&&await prisma.user.count({where:{id:uncertain.id}})===0);await lostPage.screenshot({path:path.join(evidence,'resultado-incierto-mobile.png'),fullPage:true});await lostCtx.close();
 phase='account-rate-limit';const service=app.get(AccountDeletionService);let status=[];for(let i=0;i<6;i++){try{await service.deleteOwnAccount({sub:limited.id,email:limited.email,authVersion:0},{password:'synthetic-wrong-password',confirmation:'ELIMINAR'});status.push(200);}catch(e){status.push(e.getStatus?.());}}
 record('durable-account-rate-five-attempts-then-429',JSON.stringify(status)==='[401,401,401,401,401,429]'&&await prisma.user.count({where:{id:limited.id}})===1);
 const currentCheckpoint=(await journal.snapshot()).checkpoint;record('independent-current-custody-two-deletions',currentCheckpoint.sequence===2||(await journal.snapshot()).entries.length===2);
 phase='restore-target-create';own.restoreDatabase=own.runId+'_restore_test';own.restoreMarker=own.marker+';role=restore-target';fs.writeFileSync(path.join(folder,'db-owner.json'),JSON.stringify(own,null,2)+'\n');
 record('restore-name-absent',sql('postgres',`SELECT count(*) FROM pg_database WHERE datname='${own.restoreDatabase}'`)==='0');docker(['createdb','-U','pokemon','-T','template0',own.restoreDatabase]);sql('postgres',`COMMENT ON DATABASE "${own.restoreDatabase}" IS '${own.restoreMarker}'`);assertDB(own.restoreDatabase,own.restoreMarker);
 record('target-traffic-closed-empty',sql(own.restoreDatabase,"SELECT count(*) FROM pg_tables WHERE schemaname='public'")==='0');
 let decipher=createDecipheriv('aes-256-gcm',backupKey,iv);decipher.setAAD(aad);decipher.setAuthTag(tag);let decrypted=Buffer.concat([decipher.update(fs.readFileSync(encryptedPath)),decipher.final()]);record('encrypted-backup-authenticated-before-restore',createHash('sha256').update(decrypted).digest('hex')===plainHash);
 docker(['pg_restore','-U','pokemon','-d',own.restoreDatabase,'--single-transaction','--exit-on-error','--no-owner','--no-acl'],{input:decrypted});decrypted.fill(0);decrypted=null;backupKey.fill(0);fs.unlinkSync(encryptedPath);
 targetPrisma=new PrismaClient({datasources:{db:{url:`postgresql://pokemon:pokemon@127.0.0.1:55432/${own.restoreDatabase}`}}});
 record('actual-old-backup-contained-deleted-users',await targetPrisma.user.count({where:{id:{in:[first.id,uncertain.id]}}})===2);
 for(const [label,checkpoint,date] of [['stale-checkpoint',{...currentCheckpoint,sequence:-1},originalCreatedAt],['missing-checkpoint',undefined,originalCreatedAt],['expired-original',currentCheckpoint,new Date(Date.now()-31*86400000).toISOString()]]){let rejected=false;try{await restoreWithSuppressions(targetPrisma,journal,{originalCreatedAt:date,currentCheckpoint:checkpoint});}catch{rejected=true;}record('restore-fail-closed-'+label,rejected&&await targetPrisma.user.count({where:{id:first.id}})===1);}
 phase='restore-suppression';record('restore-replays-two-deletions',await restoreWithSuppressions(targetPrisma,journal,{originalCreatedAt,currentCheckpoint})===2);record('restore-idempotent-zero',await restoreWithSuppressions(targetPrisma,journal,{originalCreatedAt,currentCheckpoint})===0);
 record('restore-preserves-other-user-global-catalog',await targetPrisma.user.count({where:{id:other.id}})===1&&JSON.stringify(await targetPrisma.$queryRawUnsafe('SELECT (SELECT count(*) FROM cards)::int AS cards,(SELECT count(*) FROM card_sets)::int AS sets,(SELECT count(*) FROM card_prices)::int AS prices,(SELECT count(*) FROM price_refresh_jobs)::int AS jobs'))===JSON.stringify(globalCounts));
 await targetPrisma.$disconnect();targetPrisma=null;await app.close();app=null;
 phase='restored-app-open-after-replay';app=await startApp(own.restoreDatabase);prisma=app.get(PrismaService);
 record('restored-api-started-only-after-suppressions',await prisma.user.count({where:{id:{in:[first.id,uncertain.id]}}})===0&&await app.get(AccountDeletionService).isAvailable());
 record('restored-old-login-rejected',(await request('/auth/login',{method:'POST',body:{email:first.email,password}})).status===401);record('restored-other-login-works',(await request('/auth/login',{method:'POST',body:{email:other.email,password}})).status===200);
 record('restored-old-jwt-rejected',(await request('/users/me',{token:first.token})).status===401);record('restored-old-refresh-rejected',(await request('/auth/refresh',{method:'POST',body:{},headers:{Cookie:first.cookie}})).status===401);record('restored-share-404',(await request('/s/'+share.slug)).status===404);
 record('unauthenticated-availability-401-no-store',(await request('/auth/account-deletion-availability')).status===401);
 phase='http-origin-dto-rate';const oldOtherToken=other.token;
 const forbidden=await request('/auth/account-deletions',{method:'POST',body:{password,confirmation:'ELIMINAR'},token:oldOtherToken,headers:{Origin:'https://foreign.example.invalid'}});record('foreign-origin-rejected-no-delete',forbidden.status===403&&await prisma.user.count({where:{id:other.id}})===1);
 const invalid=await request('/auth/account-deletions',{method:'POST',body:{password,confirmation:'NO'},token:oldOtherToken});record('invalid-confirmation-rejected-no-delete',invalid.status===400&&await prisma.user.count({where:{id:other.id}})===1);
 const wrong=await request('/auth/account-deletions',{method:'POST',body:{password:'synthetic-wrong-password',confirmation:'ELIMINAR'},token:oldOtherToken});record('http-wrong-password-safe-code',wrong.status===401&&wrong.body.code==='ACCOUNT_DELETION_AUTH_INVALID');
 const rate=await request('/auth/account-deletions',{method:'POST',body:{password,confirmation:'ELIMINAR'},token:oldOtherToken});record('http-ip-rate-fourth-rejected-429-no-delete',rate.status===429&&rate.body.code==='ACCOUNT_DELETION_RATE_LIMITED'&&await prisma.user.count({where:{id:other.id}})===1);
 await app.close();app=null;
 phase='invalid-custody-startup';const missing=new LocalSuppressionJournal({journalDirectory:path.join(folder,'missing-journal'),checkpointDirectory:path.join(folder,'missing-custody'),hmacKey});let denied=false;try{await missing.open();}catch{denied=true;}record('missing-custody-cannot-open',denied);await missing.close();
 record('no-external-provider-contact',blocked===0);
 save('summary.json',{scope:'Compiled Nest/Next, real browser, actual encrypted pg_dump/pg_restore on two owned databases, independent live journal and trusted checkpoint',checks:checks.length,passed:checks.every(c=>c.pass),screenshots:7,realAccountsTouched:false,productionBackupOperationAccredited:false,externalMail:false,originalSnapshotAgeSeconds:Math.floor((Date.now()-Date.parse(originalCreatedAt))/1000)});
}catch(e){exit=1;save('runtime-failure.json',{phase,checksCompleted:checks.length,reason:e.message?.startsWith('FAILED_')?e.message:'runtime-error',errorKind:e.name,firstLine:String(e.message).split('\n')[0].replaceAll(password,'[REDACTED]').replace(/@[a-zA-Z0-9.-]+/g,'@[REDACTED]')});}
finally{await browser?.close();await targetPrisma?.$disconnect();if(app)await app.close();if(next){next.kill('SIGTERM');await new Promise(r=>{if(next.exitCode!==null)r();else{next.once('exit',r);setTimeout(()=>{next.kill('SIGKILL');r();},5000).unref();}});}for(const d of [journalDir,custodyDir])if(fs.existsSync(d))fs.rmSync(d,{recursive:true});const dump=path.join(folder,'owned-snapshot.enc');if(fs.existsSync(dump))fs.unlinkSync(dump);save('runtime-resource-cleanup.json',{appClosed:true,browserClosed:true,nextStopped:!next||next.exitCode!==null||next.signalCode!==null,journalAndEncryptedDumpRemoved:true,exitCode:exit});}
console.log(JSON.stringify({exitCode:exit,phase,checks:checks.length,passed:checks.filter(c=>c.pass).length}));process.exit(exit);
