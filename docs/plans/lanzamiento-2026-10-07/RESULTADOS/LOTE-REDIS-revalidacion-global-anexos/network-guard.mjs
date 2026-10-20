import { appendFileSync } from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=(input, init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){
  appendFileSync('/private/tmp/be07-global-469af22a0f8f/external-fetch-attempts.jsonl',JSON.stringify({hostname:url.hostname})+'\n');
  throw new Error('Proveedor externo bloqueado por aislamiento del gate');
 }
 return original(input,init);
};
