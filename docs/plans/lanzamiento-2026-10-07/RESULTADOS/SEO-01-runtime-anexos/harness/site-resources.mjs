import {createHash} from 'node:crypto';import {writeFile} from 'node:fs/promises';
const out='/private/tmp/seo01-runtime-sol-20261008';
async function get(path){const r=await fetch('http://127.0.0.1:3000'+path,{headers:{'User-Agent':'Mozilla/5.0 (compatible; SEO01 audit)'},signal:AbortSignal.timeout(15000)});const text=await r.text();return {status:r.status,contentType:r.headers.get('content-type'),cacheControl:r.headers.get('cache-control'),bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),text}}
const robots=await get('/robots.txt'),sitemap=await get('/sitemap.xml');
const urls=[...sitemap.text.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
const report={capturedAt:new Date().toISOString(),robots:{status:robots.status,contentType:robots.contentType,cacheControl:robots.cacheControl,bytes:robots.bytes,sha256:robots.sha256,rules:robots.text.split(/\r?\n/).filter(x=>/^(User-agent|Allow|Disallow|Sitemap):/i.test(x))},sitemap:{status:sitemap.status,contentType:sitemap.contentType,cacheControl:sitemap.cacheControl,bytes:sitemap.bytes,sha256:sitemap.sha256,urls}};
await writeFile(out+'/site-resources.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
