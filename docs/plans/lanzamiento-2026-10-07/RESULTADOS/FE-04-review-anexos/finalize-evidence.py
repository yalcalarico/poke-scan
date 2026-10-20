from pathlib import Path
import json,hashlib,subprocess,datetime,re
root=Path('/Users/ysmaelalcalarico/Projects/pokemon-cards-scanner-app');ann=root/'docs/plans/lanzamiento-2026-10-07/RESULTADOS/FE-04-review-anexos';out=ann.parent
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
received=json.loads((ann/'received-sha256.json').read_text());base=json.loads((ann/'source-received.json').read_text())
assert all(h(ann/'received'/p)==v for p,v in received.items())
changed=[p for p,v in base.items() if h(root/p)!=v];new=['frontend/lib/api/session-mutations.ts','frontend/hooks/use-auth.test.tsx']
allowed={'frontend/lib/api/auth.ts','frontend/lib/api/session-generation.test.ts','frontend/lib/api/recovery-api.test.ts','frontend/lib/api/api-client.ts','frontend/lib/recovery/recovery-view.ts','frontend/lib/recovery/recovery-capture-script.ts','frontend/lib/recovery/recovery-capture-script.test.ts','frontend/hooks/use-auth.tsx','frontend/docs/testing.md','frontend/docs/api-client.md','frontend/docs/routes.md','frontend/components/auth/recovery-experience.tsx','frontend/components/auth/recovery-experience.test.tsx'}
assert set(changed)==allowed
producer=json.loads((ann/'baseline-producer-preserved.json').read_text())['hashes'];assert all(h(ann/p)==v for p,v in producer.items())
immutable=[p for p in received if p.startswith('docs/')];assert all(h(root/p)==received[p] for p in immutable)
with (ann/'review-diff.patch').open('w') as diff:
 for p in changed+new:
  prior=ann/'received'/p if p in received else Path('/dev/null')
  result=subprocess.run(['git','diff','--no-index','--',str(prior),str(root/p)],text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE);assert result.returncode in (0,1);diff.write(result.stdout)
sourcehashes={p:h(root/p) for p in received if p.startswith('frontend/')};sourcehashes.update({p:h(root/p) for p in new})
(ann/'source-final.json').write_text(json.dumps(sourcehashes,indent=2)+'\n')
verification={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'frontendInventory':{'received':len(base),'unchanged':len(base)-len(changed),'changedAllowed':changed,'newAllowed':new,'outsideReservationChanged':[],'note':'tsconfig.tsbuildinfo excluded as generated check cache; inventory covers frontend, not a whole-repository snapshot'},'preservation':{'copiedFilesVerified':len(received),'producerBaselinesVerified':len(producer),'producerReceiptUnchanged':immutable,'baselineKind':'Root review receipt before review edits. Producer baselines staged; not one before-first-edit snapshot.'},'liveResources':[],'runtimeRun':False,'globalRun':False,'browserRun':False}
(ann/'verification.json').write_text(json.dumps(verification,indent=2)+'\n')
