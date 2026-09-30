import { describe, expect, it } from 'vitest';

import { applySearchParamChanges } from '../search-params';

describe('applySearchParamChanges', () => {
  it('compone clicks seguidos antes de que Next confirme el primero', () => {
    const afterSort = applySearchParamChanges('', {
      sort: 'price',
      direction: 'desc',
      page: null,
    });
    const afterDirection = applySearchParamChanges(afterSort, {
      direction: 'desc',
      page: null,
    });

    const params = new URLSearchParams(afterDirection);
    expect(params.get('sort')).toBe('price');
    expect(params.get('direction')).toBe('desc');
  });

  it('elimina solo los valores que se limpian', () => {
    const result = applySearchParamChanges('sort=price&direction=desc&setId=base1', {
      direction: null,
      setId: 'base3',
    });

    expect(result).toBe('sort=price&setId=base3');
  });
});
