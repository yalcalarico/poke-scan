import http.server,urllib.request,urllib.error,urllib.parse,pathlib,json,os
root=pathlib.Path('/private/tmp/adquisicion-qa-20261011')
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  p=urllib.parse.urlsplit(self.path)
  if p.path not in ['/', '/faq','/favicon.ico','/opengraph-image','/icons/icon-192.png'] and not p.path.startswith('/_next/static/'):
   self.send_error(404);return
  with urllib.request.urlopen('http://127.0.0.1:3000'+p.path,timeout=20) as r: data=r.read();mime=r.headers.get_content_type()
  if p.path in ['/', '/faq']:
   theme=urllib.parse.parse_qs(p.query).get('qa_theme',['light'])[0]
   if theme not in ['light','dark']:self.send_error(400);return
   script=('<script>localStorage.setItem("pokescan.theme","'+theme+'");</script>').encode()
   assert b'<head>' in data
   data=data.replace(b'<head>',b'<head>'+script,1)
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
(root/'proxy-owner.json').write_text(json.dumps({'pid':os.getpid(),'host':'127.0.0.1','port':server.server_port,'scope':'GET landing/FAQ/static assets from compiled Next; only injected initial theme storage on private origin; no API/db access','source':'http://127.0.0.1:3000'},indent=2))
print(server.server_port,flush=True);server.serve_forever()
