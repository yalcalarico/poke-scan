import { PrismaClient } from '/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app/backend/node_modules/@prisma/client/default.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const db=new PrismaClient(), statePath='/private/tmp/seo01-runtime-sol-20261008/private-runtime-state.json';
const base='http://127.0.0.1:3001/api',password=randomBytes(24).toString('base64url'),email=`seo01.${randomUUID().replaceAll('-','')}@example.invalid`,username=`seo01${randomUUID().replaceAll('-','').slice(0,12)}`;
async function req(path,{method='GET',token,body,key}={}){const r=await fetch(base+path,{method,headers:{Accept:'application/json','Content-Type':'application/json','x-session-request':'1',...(token?{Authorization:`Bearer ${token}`}:{ }),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();let data=null;try{data=JSON.parse(t)}catch{}if(!r.ok)throw new Error(`fixture HTTP ${r.status}`);return data}
try{
 if(new URL(process.env.DATABASE_URL).pathname!=='/seo01_runtime_sol_20261008_test')throw new Error('DB guard mismatch');
 const setId='seo01-runtime-luna-set-20261008',cardId='seo01-runtime-luna-card-20261008';
 await db.cardSet.create({data:{id:setId,name:'Set sintético SEO',series:'Fixture SEO',releaseDate:new Date('2026-06-01T00:00:00.000Z'),rawJson:{}}});
 await db.card.create({data:{id:cardId,name:'Carta sintética SEO',supertype:'Pokémon',subtypes:[],types:['Water'],number:'1',rarity:'Rare',artist:'Artista sintético',setId,imageSmall:'/icons/icon-192.png',imageLarge:'/icons/icon-192.png',rawJson:{}}});
 await db.cardPrice.create({data:{cardId,variant:'normal',market:12.5,provider:'tcgdex',source:'tcgplayer',currency:'USD',fetchedAt:new Date('2026-10-08T00:00:00.000Z')}});
 const reg=await req('/auth/register',{method:'POST',body:{email,username,displayName:'Coleccionista sintético SEO',password}});const userId=reg.user?.id,token=reg.accessToken;if(!userId||!token)throw new Error('registration DTO mismatch');
 const collection=await req('/collections',{method:'POST',token,body:{name:'Colección sintética SEO'}}),collectionId=collection.id;
 const item=await req(`/collections/${collectionId}/items`,{method:'POST',token,key:randomUUID(),body:{cardId,quantity:1,variant:'normal',condition:'NM'}});
 const active=await req('/share',{method:'POST',token,body:{collectionId,expiresInDays:7}}),revoked=await req('/share',{method:'POST',token,body:{collectionId,expiresInDays:7}}),expired=await req('/share',{method:'POST',token,body:{collectionId,expiresInDays:7}});
 const shareIds={active:active.id,revoked:revoked.id,expired:expired.id},shareSlugs={active:active.slug,revoked:revoked.slug,expired:expired.slug};
 await db.shareLink.update({where:{id:revoked.id},data:{isActive:false}});await db.shareLink.update({where:{id:expired.id},data:{expiresAt:new Date(Date.now()-60000)}});
 await writeFile(statePath,JSON.stringify({email,username,password,userId,collectionId,itemId:item.id,shareIds,shareSlugs,cardId,setId}),{mode:0o600});
 console.log(JSON.stringify({fixtureCreated:true,entities:7}));
}finally{await db.$disconnect()}
