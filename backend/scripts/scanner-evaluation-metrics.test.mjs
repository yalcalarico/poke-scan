import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQueries, summarizeIdentity } from './scanner-evaluation-metrics.mjs';

test('no convierte una etiqueta pendiente en negativo y conserva compatibilidad', () => {
  const q = validateQueries([{path:'a.jpg',cardId:null,labelStatus:'unlabelled'},{path:'b.jpg',cardId:null},{path:'c.jpg',cardId:'me55-92'}]);
  assert.deepEqual(q.map(r => r.labelStatus), ['unlabelled','negative','positive']);
  assert.throws(() => validateQueries([{path:'a',cardId:null,labelStatus:'positive'}]));
  assert.throws(() => validateQueries([{path:'a',cardId:'id',labelStatus:'negative'}]));
  assert.throws(() => validateQueries([{path:'a',cardId:'id'},{path:'a',cardId:'id'}]));
});
test('top-8, referencias ausentes y negativos se cuentan una vez y por origen', () => {
  const row = {repeat:0,origin:'camera-crop',split:'holdout',conditions:['funda'],photoHash:'a',labelStatus:'positive',cardId:'correct',expectedReferencePresent:true,candidates:[{id:'wrong'},{id:'correct'}]};
  const unknown = {...row,labelStatus:'unlabelled',cardId:null,photoHash:'b'};
  const m=summarizeIdentity([row,{...row,repeat:1},unknown,{...row,labelStatus:'negative',cardId:null,photoHash:'c'}, {...row,origin:'original',cardId:'missing',expectedReferencePresent:false,photoHash:'d'}]);
  assert.equal(m.samples,4); assert.equal(m.positives,2); assert.equal(m.top1,0); assert.equal(m.top8,1);
  assert.equal(m.missingReferences,1); assert.equal(m.retrievalMissesTop8,1);
  assert.equal(m.negatives,1); assert.equal(m.unlabelled,1); assert.equal(m.falseSessionAcceptances,1);
  assert.equal(m.byOrigin['camera-crop'].top8Rate,1);
  assert.equal(m.bySplit.holdout.samples,4);
});
test('sin negativos la tasa es null; detecta bytes duplicados', () => {
  const r={repeat:0,origin:'original',split:'development',conditions:[],photoHash:'same',labelStatus:'positive',cardId:'id',expectedReferencePresent:true,candidates:[{id:'id'}]};
  const m=summarizeIdentity([r,r]);
  assert.equal(m.falseSessionAcceptanceRate,null); assert.equal(m.top1Rate,1); assert.equal(m.duplicatePhotoHashes,1);assert.equal(m.distinctPositiveIds,1);
});
