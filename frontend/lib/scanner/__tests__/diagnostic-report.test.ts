import { describe, expect, it } from 'vitest';
import { addDiagnosticReading, confirmDiagnosticIdentity, createDiagnosticSession } from '../diagnostic-session';
import { createDiagnosticHtml, createDiagnosticReportData, diagnosticReportFile } from '../diagnostic-report';
import type { CaptureReview } from '../capture-review';
import type { VisualIdentifyResponseDto } from '@/types/api';

const result: VisualIdentifyResponseDto = {
  candidates: [], retrievalLimit: 0, references: 0, indexVersion: 'test', indexStale: false,
  collections: 0, indexMs: 0, cold: false, modelMs: 0, inferenceMs: 0, totalMs: 0,
};

describe('diagnostic report', () => {
  it('exports schema version, exact crop, full model result, and safe script data without remote resources', async () => {
    const session = createDiagnosticSession();
    const review: CaptureReview = {
      image: 'data:image/png;base64,YWJj', source: 'gallery', capturedAt: '2026-10-24T12:00:00Z', runId: 9,
      result: { ...result, indexVersion: '</script><script>alert(1)</script>' }, error: '</script>error',
    };
    addDiagnosticReading(session, review);
    const data = createDiagnosticReportData(session);
    expect(data.schemaVersion).toBe(1);
    expect(data.readings[0].image).toBe(review.image);
    expect(data.readings[0].result?.indexVersion).toBe(review.result?.indexVersion);
    const html = createDiagnosticHtml(session);
    expect(html).toContain('data:image/png;base64,YWJj');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).not.toMatch(/https?:\/\//);
    const file = diagnosticReportFile(session);
    expect(file.filename).toMatch(/\.html$/);
    expect(file.blob.type).toContain('text/html');
    expect(await file.blob.text()).toBe(html);
  });

  it('classifies proposal and final against expected set and reports original rank only when present', () => {
    const session = createDiagnosticSession({ id: 'set-a', name: 'Set A' });
    const reading = addDiagnosticReading(session, {
      image: 'data:image/png;base64,YQ==', source: 'camera', capturedAt: '2026-10-24T12:00:00Z', runId: 1,
      result: { ...result, candidates: [{ card: {
        id: 'inside', name: 'Inside', supertype: 'Pokémon', subtypes: [], hp: null, types: [], number: '1', rarity: null, artist: null,
        setId: 'set-a', set: { id: 'set-a', name: 'Set A', series: null, printedTotal: 1, total: 1, releaseDate: null, logoUrl: null, symbolUrl: null }, imageSmall: '', imageLarge: '',
      }, similarity: .9, retrievalRank: 2 }] }, error: null,
    })!;
    confirmDiagnosticIdentity(session, reading.id, { id: 'inside', name: 'Inside', setId: 'set-a', setName: 'Set A', number: '1' }, 'manual');
    let assessment = createDiagnosticReportData(session).expectedSetAssessment[0];
    expect(assessment).toMatchObject({ proposal: 'in_set', final: 'in_set', finalRank: 2 });
    expect(createDiagnosticReportData(session).expectedSetAssessment[0].finalRank).toBe(2);
    confirmDiagnosticIdentity(session, reading.id, { id: 'outside', name: 'Outside', setId: 'set-b', setName: 'Set B', number: '4' }, 'manual');
    assessment = createDiagnosticReportData(session).expectedSetAssessment[0];
    expect(assessment).toMatchObject({ proposal: 'in_set', final: 'outside_set', finalRank: null });
    expect(createDiagnosticHtml(session)).toContain('No estaba entre las alternativas originales');

    const noExpected = createDiagnosticSession();
    const unknownReading = addDiagnosticReading(noExpected, {
      image: 'data:image/png;base64,YQ==', source: 'camera', capturedAt: '2026-10-24T12:00:00Z', runId: 2, result: null, error: null,
    })!;
    assessment = createDiagnosticReportData(noExpected).expectedSetAssessment[0];
    expect(assessment).toMatchObject({ proposal: 'unknown', final: 'unknown', finalRank: null });
    expect(createDiagnosticHtml(noExpected)).toContain('desconocido');
    expect(unknownReading.initial).toBeNull();
  });
});
