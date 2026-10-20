/** Orden global HTTP contra snapshot SQL; no pide refrescos de precios. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {PrismaClient} from '@prisma/client';
const [output]=process.argv.slice(2);
if(!output||output==='--help'){console.log('Desde backend con API arriba: node --env-file-if-exists=.env scripts/catalog-price-order-smoke.mjs REPORTE. Todo el catalogo asc/desc, 750 ms entre requests, sin refrescar precios.');process.exit(output==='--help'?0:1);}
const prisma=new PrismaClient(),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cte=`WITH latest AS (SELECT DISTINCT ON ("cardId",variant) "cardId",variant,market FROM card_prices WHERE provider='tcgdex' AND source='tcgplayer' AND currency='USD' ORDER BY "cardId",variant,"fetchedAt" DESC), prices AS (SELECT "cardId",MAX(market) AS price FROM latest WHERE market IS NOT NULL GROUP BY "cardId")`;
const query=order=>prisma.$queryRawUnsafe(cte+` SELECT c.id,c.name,cp.price::text FROM cards c LEFT JOIN prices cp ON cp."cardId"=c.id ORDER BY ${order}`);
const start=performance.now(),results=[];
try{
 const beforeHash=digest(await query('c.id'));
 for(const direction of ['ASC','DESC']){
  const expected=await query(`cp.price ${direction} NULLS LAST,c.name ASC,c.id ASC`);
  const priced=expected.filter(r=>r.price!==null).length,ids=[],mismatches=[],pages=Math.ceil(expected.length/100);
  for(let page=1;page<=pages;page++){
   const response=await fetch(`http://localhost:3001/api/cards/search?sort=price&direction=${direction.toLowerCase()}&pageSize=100&page=${page}`);
   assert.equal(response.status,200,`Pagina ${page} ${direction}: HTTP ${response.status}`);
   const body=await response.json();assert.equal(body.total,expected.length);
   const actual=body.data.map(r=>r.id),wanted=expected.slice((page-1)*100,page*100).map(r=>r.id);
   if(JSON.stringify(actual)!==JSON.stringify(wanted))mismatches.push({page,actual,wanted});ids.push(...actual);
   if(page%25===0||page===pages)console.log(JSON.stringify({direction,page,pages,ids:ids.length,mismatchPages:mismatches.length}));
   await delay(750);
  }
  assert.equal(new Set(ids).size,ids.length,'Sin IDs repetidos entre paginas.');assert.equal(ids.length,expected.length);
  results.push({direction,pages,total:ids.length,priced,unpriced:expected.length-priced,uniqueIds:new Set(ids).size,expectedOrderHash:digest(expected.map(r=>r.id)),actualOrderHash:digest(ids),boundary:expected.slice(Math.max(0,priced-2),priced+2),mismatchPages:mismatches.length,mismatches});
 }
 const afterHash=digest(await query('c.id'));
 const state=beforeHash!==afterHash?'inconclusive-data-changed':results.some(r=>r.mismatchPages)?'failed':'passed';
 if(state==='failed')process.exitCode=1;
 await writeFile(output,JSON.stringify({evaluatedAt:new Date().toISOString(),state,elapsedMs:performance.now()-start,beforeHash,afterHash,scope:'Catalogo completo asc/desc en paginas de 100, ultimo market por variante tcgdex/tcgplayer/USD y MAX por carta; sin precio al final, desempates nombre/ID. SQL read-only y GET search; sin refrescar precios.',results},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({state,results:results.map(({mismatches,...r})=>r)}));
}finally{await prisma.$disconnect();}
