const original=globalThis.fetch;
const firstAllowed=Date.parse("2026-10-14T20:30:00+00:00");
const first30thAllowed=Date.parse("2026-10-14T14:22:14.533+00:00");
function allowedAt(url) {
 if(url.pathname === '/last-updated.txt' || /^\/tcgplayer\/3\/24722\/(products|prices)$/.test(url.pathname)) return first30thAllowed;
 return firstAllowed;
}
globalThis.fetch=(input,init)=>{
 const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 const url=new URL(raw);
 if(['localhost','127.0.0.1','[::1]'].includes(url.hostname))return original(input,init);
 const method=(init?.method??(typeof input==='object'&&'method' in input?input.method:'GET')).toUpperCase();
 const headers=new Headers(init?.headers??(typeof input==='object'&&'headers' in input?input.headers:undefined));
 const pathAllowed=/^\/last-updated\.txt$|^\/tcgplayer\/3\/(24722|24837)\/(products|prices)$/.test(url.pathname);
 if(url.origin==='https://tcgcsv.com'&&pathAllowed&&!url.search&&!url.hash&&method==='GET'&&!headers.has('Authorization')&&!headers.has('Cookie')&&Date.now()>=allowedAt(url))return original(input,{...init,redirect:'error'});
 return Promise.reject(new Error('Proveedor o momento de descarga no autorizado en esta instancia local'));
};
