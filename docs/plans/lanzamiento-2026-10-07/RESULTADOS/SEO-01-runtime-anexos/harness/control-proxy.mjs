import http from 'node:http';
let failedSlug=null;
const server=http.createServer(async (req,res)=>{
  const u=new URL(req.url??'/', 'http://127.0.0.1:3002');
  if(u.pathname==='/__owner__/fail') { failedSlug=u.searchParams.get('slug');res.writeHead(204);return res.end(); }
  if(u.pathname==='/__owner__/clear') { failedSlug=null;res.writeHead(204);return res.end(); }
  const slug=u.pathname.startsWith('/api/s/')?u.pathname.slice('/api/s/'.length):null;
  if(req.method==='GET'&&slug&&slug===failedSlug){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({statusCode:503,message:'Synthetic harness upstream failure'}));}
  const chunks=[];for await (const chunk of req)chunks.push(chunk);
  const headers={...req.headers,host:'127.0.0.1:3001'};delete headers['content-length'];
  const upstream=await fetch(`http://127.0.0.1:3001${req.url}`,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined,redirect:'manual'});
  res.writeHead(upstream.status,Object.fromEntries(upstream.headers));res.end(Buffer.from(await upstream.arrayBuffer()));
});
server.listen(3002,'127.0.0.1');
