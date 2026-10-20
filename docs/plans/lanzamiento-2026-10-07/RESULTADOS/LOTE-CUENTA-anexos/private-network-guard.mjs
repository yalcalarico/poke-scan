import fs from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)){fs.appendFileSync('/private/tmp/cuenta-gate-3aaf105723d3/next-external-blocked.jsonl',JSON.stringify({blocked:true})+'\n');throw new Error('GATE_EXTERNAL_FETCH_BLOCKED');}return original(input,init);};
