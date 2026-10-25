// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { CardDto, VisualIdentifyResponseDto } from '@/types/api';
import { addDiagnosticReading, confirmDiagnosticIdentity, createDiagnosticSession } from '../diagnostic-session';
import { createDiagnosticHtml } from '../diagnostic-report';

const card: CardDto = { id: 'card-1', name: 'Carta <A> & B', setId: 'expected', number: '1', supertype: 'Pokémon',
  subtypes: [], hp: null, types: [], rarity: null, artist: null, imageSmall: '', imageLarge: '' };
const result: VisualIdentifyResponseDto = { candidates: [{ card, similarity: .8, retrievalRank: 2 }], retrievalLimit: 8,
  references: 1, indexVersion: 'test', indexStale: false, collections: 1, indexMs: 1, cold: false, modelMs: 1, inferenceMs: 1, totalMs: 3 };

function renderReport(html: string): Document {
  const report = new DOMParser().parseFromString(html, 'text/html');
  const script = report.querySelector('script:not([type])')?.textContent;
  if (!script) throw new Error('Falta el renderizador del informe.');
  new Function('document', script)(report);
  return report;
}

it('renderiza el puesto original y la comparación del set sin alterar los datos', () => {
  const session = createDiagnosticSession({ id: 'expected', name: 'Set esperado' });
  const reading = addDiagnosticReading(session, { image: 'data:image/png;base64,YQ==', source: 'camera',
    capturedAt: '2026-10-25T00:00:00Z', runId: 1, result, error: null })!;
  confirmDiagnosticIdentity(session, reading.id, { id: card.id, name: card.name, setId: card.setId, setName: 'Set esperado', number: '1' }, 'manual');
  let report = renderReport(createDiagnosticHtml(session));
  expect(report.querySelector('section')?.textContent).toContain('puesto original 2');
  expect(report.querySelector('section')?.textContent).toContain('Dentro del set esperado');
  expect(report.querySelector('section')?.textContent).toContain(card.name);
  expect(report.querySelector('img')?.getAttribute('src')).toBe(reading.image);
  const exported = JSON.parse(report.querySelector('#diagnostic-data')!.textContent!);
  expect(exported.readings[0].result).toEqual(result);

  confirmDiagnosticIdentity(session, reading.id, { id: 'other', name: 'Otra', setId: 'other-set', setName: 'Otro set', number: '3' }, 'manual');
  report = renderReport(createDiagnosticHtml(session));
  expect(report.querySelector('section')?.textContent).toContain('No estaba entre las alternativas originales');
  expect(report.querySelector('section')?.textContent).toContain('Fuera del set esperado');
  expect(report.querySelector('#summary')?.textContent).toContain('finales dentro/fuera/desconocido 0/1/0');
});

it('distingue falta de confirmación y de ranking de una ausencia real entre alternativas', () => {
  const session = createDiagnosticSession();
  const reading = addDiagnosticReading(session, { image: 'data:image/png;base64,YQ==', source: 'gallery',
    capturedAt: '2026-10-25T00:00:00Z', runId: 1, result: null, error: 'Consulta fallida' })!;
  let report = renderReport(createDiagnosticHtml(session));
  expect(report.querySelector('section')?.textContent).toContain('Sin identidad confirmada');
  expect(report.querySelector('section')?.textContent).not.toContain('No estaba entre las alternativas originales');
  confirmDiagnosticIdentity(session, reading.id, { id: card.id, name: card.name, setId: card.setId, setName: null, number: '1' }, 'manual');
  report = renderReport(createDiagnosticHtml(session));
  expect(report.querySelector('section')?.textContent).toContain('Ranking original no disponible');
  expect(report.querySelector('section')?.textContent).toContain('Sin set esperado');
});
