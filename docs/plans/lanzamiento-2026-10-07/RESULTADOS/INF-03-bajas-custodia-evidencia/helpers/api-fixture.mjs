import {createRequire} from 'node:module';
const root='/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app';
const req=createRequire(root+'/backend/package.json');
const native=globalThis.fetch;
globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))return Promise.reject(new Error('EXTERNAL_BLOCKED'));return native(input,init);};
const {Test}=req('@nestjs/testing'),{ValidationPipe,Logger}=req('@nestjs/common');Logger.overrideLogger(false);
let app;let closing=false;
const close=async()=>{if(closing)return;closing=true;try{await app?.close();process.exit(0);}catch{process.exit(1);}};
process.on('SIGTERM',close);process.on('SIGINT',close);
try{const {AppModule}=await import(root+'/backend/dist/app.module.js');const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication({logger:false});app.use(req('helmet')());app.setGlobalPrefix('api');app.enableCors({origin:['http://localhost:3000'],credentials:true});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(3001,'127.0.0.1');process.send?.({ready:true});}catch{process.send?.({ready:false});await close();}
