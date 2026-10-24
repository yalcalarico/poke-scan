import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mappingState } from './tcgcsv-coverage.mjs';

test('reporte distingue grupos compartidos autorizados y conflictos de hermanos', () => {
  const mappings = [{ setId: 'tk1a', externalId: '1543' }, { setId: 'tk1b', externalId: '1543' }];
  assert.equal(mappingState('tk1a', mappings), 'associated');
  assert.equal(mappingState('tk1b', mappings), 'associated');
  assert.equal(mappingState('missing', mappings), 'unmapped');
  const conflict = [...mappings, { setId: 'tk1b', externalId: '999' }];
  assert.equal(mappingState('tk1a', conflict), 'ambiguous');
  assert.equal(mappingState('tk1b', conflict), 'ambiguous');
  assert.equal(mappingState('tk1a', [...mappings, { setId: 'other', externalId: '1543' }]), 'ambiguous');
});
