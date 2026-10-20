/** Etiquetas y métricas de evaluación; ninguna regla modifica el reconocimiento. */
export function validateQueries(queries) {
  const origins = ['original', 'gallery-crop', 'camera-crop', 'unspecified'];
  const labels = ['positive', 'negative', 'unlabelled'];
  if (!Array.isArray(queries) || queries.length === 0) throw new Error('El manifiesto debe contener fotos.');
  const paths = new Set();
  for (const q of queries) {
    const label = q?.labelStatus ?? (q?.cardId === null ? 'negative' : 'positive');
    if (!q || typeof q.path !== 'string' || !q.path.trim() || paths.has(q.path))
      throw new Error('Cada foto debe tener una ruta única y no vacía.');
    paths.add(q.path);
    if (!labels.includes(label) ||
      (label === 'positive' && (typeof q.cardId !== 'string' || !/^[a-zA-Z0-9_!?-]+$/.test(q.cardId))) ||
      (label !== 'positive' && q.cardId !== null) ||
      (q.origin !== undefined && !origins.includes(q.origin)) ||
      (q.conditions !== undefined && (!Array.isArray(q.conditions) || !q.conditions.every(c => typeof c === 'string'))) ||
      (q.split !== undefined && !['development', 'holdout'].includes(q.split)))
      throw new Error('Etiqueta inválida: positivo con ID exacto, negativo confirmado o unlabelled con cardId null.');
  }
  return queries.map(q => ({...q, labelStatus: q.labelStatus ?? (q.cardId === null ? 'negative' : 'positive'), origin: q.origin ?? 'unspecified', split: q.split ?? 'development'}));
}

export function identityMetrics(rows) {
  const positives = rows.filter(r => r.labelStatus === 'positive');
  const negatives = rows.filter(r => r.labelStatus === 'negative');
  const top1 = positives.filter(r => r.candidates[0]?.id === r.cardId).length;
  const top8 = positives.filter(r => r.candidates.slice(0, 8).some(c => c.id === r.cardId)).length;
  const negativePredictions = negatives.filter(r => r.candidates.length > 0).length;
  return {
    samples: rows.length,
    positives: positives.length,
    negatives: negatives.length,
    unlabelled: rows.filter(r => r.labelStatus === 'unlabelled').length,
    distinctPositiveIds: new Set(positives.map(r => r.cardId)).size,
    top1, top8,
    top1Rate: positives.length ? top1 / positives.length : null,
    top8Rate: positives.length ? top8 / positives.length : null,
    falsePredictions: positives.length - top1,
    missingReferences: positives.filter(r => !r.expectedReferencePresent).length,
    retrievalMissesTop8: positives.length - top8,
    negativePredictions,
    // La UI suma el primero a sesión; esto no representa una escritura en colección.
    falseSessionAcceptances: negativePredictions,
    falseSessionAcceptanceRate: negatives.length ? negativePredictions / negatives.length : null,
    acceptancePolicy: 'La UI suma #1 DINOv2; sin rechazo calibrado ni guardado automático en colección.',
  };
}

export function summarizeIdentity(results) {
  // Las repeticiones sirven para tiempos, no para multiplicar el corpus etiquetado.
  const first = results.filter(r => r.repeat === 0);
  const groups = key => Object.fromEntries([...new Set(first.map(r => r[key]))].sort().map(value => [value, identityMetrics(first.filter(r => r[key] === value))]));
  return {...identityMetrics(first), byOrigin: groups('origin'), bySplit: groups('split'),
    byCondition: Object.fromEntries([...new Set(first.flatMap(r => r.conditions))].sort().map(value => [value, identityMetrics(first.filter(r => r.conditions.includes(value)))])),
    duplicatePhotoHashes: first.length - new Set(first.map(r => r.photoHash)).size,
  };
}
