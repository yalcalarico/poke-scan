import os, pathlib, secrets, subprocess, sys, urllib.parse
ROOT = pathlib.Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app')
TMP = pathlib.Path('/private/tmp/seo01-runtime-sol-20261008')
settings = {}
for line in (ROOT/'backend/.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1); settings[k.strip()] = v.strip().strip('"\'')
source = urllib.parse.urlsplit(settings['DATABASE_URL'])
if source.hostname not in ('localhost','127.0.0.1') or source.port != 55432 or source.path.strip('/') != 'pokemon_cards':
    raise SystemExit('Guard: development DB URL no coincide con el esperado; no se inicia nada')
parts = source._replace(netloc=source.netloc.replace(source.hostname, '127.0.0.1'), path='/seo01_runtime_sol_20261008_test')
dburl = urllib.parse.urlunsplit(parts)
env = os.environ.copy()
env.update(DATABASE_URL=dburl, DATABASE_URL_TEST=dburl, REDIS_URL='redis://127.0.0.1:56379/0', SCANNER_VISUAL_ENABLED='false', PRICE_QUEUE_ENABLED='false', ENABLE_CATALOG_SYNC_CRON='false', ENABLE_PRICE_BACKFILL_CRON='false', ENABLE_RETENTION_CRON='false', NODE_OPTIONS=f"--import={TMP}/harness/network-guard.mjs")
if sys.argv[1] == 'backend':
    env.update(NODE_ENV='development', JWT_SECRET=secrets.token_urlsafe(48), JWT_REFRESH_SECRET=secrets.token_urlsafe(48), CURRENCY_ARS_ENABLED='false', PORT='3001', FRONTEND_URL='http://localhost:3000', CORS_ORIGINS='http://localhost:3000,http://127.0.0.1:3000')
    cmd=['node','dist/main.js']
    cwd=ROOT/'backend'
elif sys.argv[1] == 'fixtures':
    env.update(NODE_ENV='development', JWT_SECRET=secrets.token_urlsafe(48), JWT_REFRESH_SECRET=secrets.token_urlsafe(48), CORS_ORIGINS='http://localhost:3000,http://127.0.0.1:3000')
    cmd=['node', str(TMP/'harness/fixtures.mjs')]
    cwd=ROOT/'backend'
elif sys.argv[1] == 'frontend':
    env.update(NODE_ENV='production', API_INTERNAL_URL='http://127.0.0.1:3002/api', PORT='3000')
    cmd=['node','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000']
    cwd=ROOT/'frontend'
else:
    raise SystemExit('usage: run-owned.py backend|frontend|fixtures')
os.chdir(cwd)
os.execvpe(cmd[0],cmd,dict(env, PWD=str(cwd)))
