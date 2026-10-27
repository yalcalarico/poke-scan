// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { VisualIdentifyResponseDto } from '@/types/api';
import { createDiagnosticHtml } from '@/lib/scanner/diagnostic-report';
import type { DiagnosticSession } from '@/lib/scanner/diagnostic-session';
import type { OrganizeSheetProps } from '../organize-sheet';
import type { IdlePanelProps } from '../idle-panel';
const mocks = vi.hoisted(() => ({ recognize: vi.fn(), prepare: vi.fn(), close: vi.fn(), download: vi.fn(), report: vi.fn(), getSets: vi.fn(), authenticated: true, push: vi.fn() }));
vi.mock('@/lib/scanner/capture-review', () => ({ downloadCaptureReview: mocks.download }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ isAuthenticated: mocks.authenticated, isLoading: false }) }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: (value: number | null | undefined) => value == null ? '—' : `USD ${value}` }) }));
vi.mock('@/hooks/use-mobile-camera', () => ({ useMobileCamera: () => false }));
vi.mock('@/lib/scanner/camera-visual', () => ({ recognizeCameraCard: mocks.recognize }));
vi.mock('@/lib/api/cards', async (original) => ({ ...await original<typeof import('@/lib/api/cards')>(), getCardPrices: vi.fn(async () => ({ prices: [] })), getSets: mocks.getSets }));
vi.mock('@/lib/scanner/diagnostic-report', async (original) => ({ ...await original<typeof import('@/lib/scanner/diagnostic-report')>(), downloadDiagnosticReport: mocks.report }));
vi.mock('@/lib/scanner/visual-photo', () => ({ prepareVisualPhoto: mocks.prepare }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/scanner', async (original) => ({
  ...await original<typeof import('@/components/scanner')>(),
  IdlePanel: ({ sessionCount }: IdlePanelProps) => <p>Sesión: {sessionCount}</p>,
  DetectedCardBar: ({ candidate }: { candidate: { card: { id: string } } }) => <p>{candidate.card.id}</p>,
  OrganizeSheet: ({ entries, onReview, onCorrect, onSaved, onClose }: OrganizeSheetProps) => <div>{entries.map((entry) => <div key={entry.runId}>
    <button onClick={() => onReview?.(entry.runId)}>Revisar lectura {entry.runId}</button>
    <button onClick={() => onCorrect?.(entry.runId, { id: 'manual-id', name: 'Manual', setId: 'manual-set', number: '9', supertype: 'Pokémon', subtypes: [], hp: null, types: [], rarity: null, artist: null, imageSmall: '', imageLarge: '' })}>Confirmar carta manual</button>
    <button onClick={() => onSaved([entry.runId])}>Guardar lectura</button>
  </div>)}<button onClick={onClose}>Cerrar organización</button></div>,
}));
import ScanPage from '@/app/(app)/escanear/page';
const selected = (id: string) => ({ card: { id, name: 'Toxtricity', setId: 'me55', number: '59', imageSmall: '/card.png', imageLarge: '/card.png' }, score: 0.7, rawScore: 0.7, price: null });
function upload() {
  fireEvent.change(screen.getByLabelText('Elegir una foto de la carta'), { target: { files: [new File(['x'], 'carta.png', { type: 'image/png' })] } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.getSets.mockResolvedValue([]);
  sessionStorage.clear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL: vi.fn() }));
  mocks.prepare.mockResolvedValue({ image: 'data:image/png;base64,YQ==', source: { highResolutionSource: { close: mocks.close } } });
});

it('vincula captura, corrección manual y guardado al mismo diagnóstico descargable', async () => {
  const modelCard = { id: 'model-id', name: 'Modelo', setId: 'model-set', number: '1', imageSmall: '/model.png', imageLarge: '/model.png',
    supertype: 'Pokémon', subtypes: [], hp: null, types: [], rarity: null, artist: null };
  const prediction: VisualIdentifyResponseDto = { candidates: [{ card: modelCard, similarity: 0.8, retrievalRank: 1 }],
    retrievalLimit: 8, references: 10, indexVersion: 'test-index', indexStale: false, collections: 1, indexMs: 1, cold: false, modelMs: 1, inferenceMs: 1, totalMs: 3 };
  mocks.recognize.mockImplementationOnce(async (_image: string, _signal: AbortSignal, onResult: (value: VisualIdentifyResponseDto) => void) => {
    onResult(prediction);
    return selected('model-id');
  });
  render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Configurar diagnóstico' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Iniciar diagnóstico' }));
  upload();
  await screen.findByText('Sesión: 1');
  fireEvent.click(screen.getByRole('button', { name: 'Revisar última foto' }));
  fireEvent.click(screen.getByRole('button', { name: '¿No está? Buscá a mano' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar carta manual' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lectura' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar organización' }));
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar diagnóstico' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descargar informe HTML' }));
  const report = mocks.report.mock.calls[0]?.[0] as DiagnosticSession;
  expect(report.readings).toHaveLength(1);
  expect(report.readings[0]).toMatchObject({ runId: 1, image: 'data:image/png;base64,YQ==', initial: { id: 'model-id' }, final: { id: 'manual-id' }, result: prediction });
  expect(report.readings[0].events.map((event) => event.type)).toEqual(expect.arrayContaining(['crop_sent', 'prediction_received', 'comparison_opened', 'manual_search_opened', 'manual_result_confirmed', 'identity_confirmed', 'saved']));
  expect(JSON.stringify(sessionStorage)).not.toContain('data:image');
  expect(JSON.stringify(sessionStorage)).not.toContain('prediction_received');
  const html = createDiagnosticHtml(report);
  expect(html).toContain('data:image/png;base64,YQ==');
  expect(html).toContain('"id": "model-id"');
  expect(html).toContain('"id": "manual-id"');
  expect(html).toContain('manual_result_confirmed');
  expect(html).toContain('identity_confirmed');
});
it('la foto subida usa DINOv2, suma el candidato elegido y libera la imagen original', async () => {
  mocks.recognize.mockResolvedValue(selected('me55-59'));
  render(<ScanPage />);
  await screen.findByText('Sesión: 0');
  upload();
  await screen.findByText('Sesión: 1');
  expect(screen.getByText('Sesión: 1')).toBeInTheDocument();
  expect(mocks.recognize).toHaveBeenCalledWith('data:image/png;base64,YQ==', expect.any(AbortSignal), expect.any(Function));
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar última foto' }));
  fireEvent.click(screen.getByText('¿No coincidió? Guardá el recorte'));
  fireEvent.click(screen.getByRole('button', { name: 'Descargar recorte' }));
  expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ image: 'data:image/png;base64,YQ==', source: 'gallery', result: null }), 'image');
});
it('una advertencia orientativa no bloquea reconocer y queda fuera de la sesión persistida', async () => {
  const quality = { schemaVersion: 1 as const, analysisWidth: 183, analysisHeight: 256, laplacianVariance: 10, brightFraction: 0, largestBrightRegionFraction: 0, warnings: ['blur'] as Array<'blur' | 'glare'> };
  mocks.prepare.mockResolvedValue({ image: 'data:image/png;base64,YQ==', quality, source: { highResolutionSource: { close: mocks.close } } });
  mocks.recognize.mockResolvedValue(selected('me55-59'));
  render(<ScanPage />);
  await screen.findByText('Sesión: 0');
  upload();
  await screen.findByText('Sesión: 1');
  expect(screen.getByText(/Puede faltar enfoque/)).toBeInTheDocument();
  expect(mocks.recognize).toHaveBeenCalledWith('data:image/png;base64,YQ==', expect.any(AbortSignal), expect.any(Function));
  expect(JSON.stringify(sessionStorage)).not.toContain('laplacianVariance');
  fireEvent.click(screen.getByRole('button', { name: 'Revisar última foto' }));
  fireEvent.click(screen.getByText('¿No coincidió? Guardá el recorte'));
  fireEvent.click(screen.getByRole('button', { name: 'Descargar diagnóstico' }));
  expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ quality }), 'diagnostic');
});
it('una respuesta cancelada no agrega una carta después de subir otra foto', async () => {
  mocks.prepare.mockResolvedValueOnce({ image: 'data:image/png;base64,Yg==', source: { highResolutionSource: { close: mocks.close } } });
  let finish: (value: ReturnType<typeof selected>) => void = () => {};
  mocks.recognize.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(selected('me55-59'));
  render(<ScanPage />);
  await screen.findByText('Sesión: 0');
  upload();
  await waitFor(() => expect(mocks.recognize).toHaveBeenCalledTimes(1));
  upload();
  await screen.findByText('Sesión: 1');
  finish(selected('swsh8-108'));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Sesión: 1')).toBeInTheDocument();
  expect(screen.queryByText('swsh8-108')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar última foto' }));
  fireEvent.click(screen.getByText('¿No coincidió? Guardá el recorte'));
  fireEvent.click(screen.getByRole('button', { name: 'Descargar recorte' }));
  expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ image: 'data:image/png;base64,YQ==', runId: 2 }), 'image');
});

it('permite descargar el recorte enviado cuando falla el reconocimiento, pero no cuando falla la preparación', async () => {
  mocks.recognize.mockRejectedValue(new Error('El motor se interrumpió.'));
  render(<ScanPage />);
  await screen.findByText('Sesión: 0');
  upload();
  await screen.findByText('El motor se interrumpió.');
  fireEvent.click(screen.getByRole('button', { name: 'Descargar diagnóstico' }));
  expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ image: 'data:image/png;base64,YQ==', error: 'El motor se interrumpió.' }), 'diagnostic');
  mocks.prepare.mockRejectedValueOnce(new Error('Foto inválida.'));
  upload();
  await screen.findByText('Foto inválida.');
  expect(screen.queryByRole('button', { name: 'Descargar recorte' })).not.toBeInTheDocument();
});

it('pide login antes de preparar o reconocer una foto sin sesión', async () => {
  mocks.authenticated = false;
  render(<ScanPage />);
  expect(await screen.findByText('Iniciá sesión para reconocer cartas')).toBeInTheDocument();
  upload();
  expect(mocks.push).toHaveBeenCalledWith('/login?next=escanear');
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.recognize).not.toHaveBeenCalled();
});

it('elegir otra coincidencia reemplaza la lectura sin duplicarla ni reconocer de nuevo', async () => {
  const card = { id: 'first', name: 'Primera', setId: 'set', number: '1', imageSmall: '/first.png', imageLarge: '/first.png',
    supertype: 'Pokémon', subtypes: [], hp: null, types: [], rarity: null, artist: null };
  const alternate = { ...card, id: 'second', name: 'Correcta', number: '2', imageSmall: '/second.png', imageLarge: '/second.png' };
  const result: VisualIdentifyResponseDto = { candidates: [{ card, similarity: 0.8, retrievalRank: 1 }, { card: alternate, similarity: 0.7, retrievalRank: 2 }],
    retrievalLimit: 8, references: 20000, indexVersion: 'test', indexStale: false, collections: 175, indexMs: 1, cold: false, modelMs: 1, inferenceMs: 1, totalMs: 3 };
  mocks.recognize.mockImplementationOnce(async (_image: string, _signal: AbortSignal, onResult: (value: VisualIdentifyResponseDto) => void) => {
    onResult(result);
    return { card, score: 0.8, rawScore: 0.8, price: null, prices: [] };
  });
  render(<ScanPage />);
  upload();
  await screen.findByText('Sesión: 1');
  fireEvent.click(screen.getByRole('button', { name: 'Revisar última foto' }));
  expect(screen.getByAltText('Tu captura de la carta')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Elegir Correcta, set, número 2' }));
  expect(screen.getByAltText('Referencia de Correcta')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar esta carta' }));
  await waitFor(() => expect(JSON.stringify(sessionStorage)).toContain('second'));
  expect(screen.getByText('Sesión: 1')).toBeInTheDocument();
  expect(screen.queryByText('first')).not.toBeInTheDocument();
  expect(mocks.recognize).toHaveBeenCalledTimes(1);
});

it('reabre una lectura anterior desde la revisión y conserva las otras sin persistir fotos', async () => {
  const card = { id: 'first', name: 'Primera', setId: 'set', number: '1', imageSmall: '/first.png', imageLarge: '/first.png',
    supertype: 'Pokémon', subtypes: [], hp: null, types: [], rarity: null, artist: null };
  const alternate = { ...card, id: 'alternate', name: 'Alternativa', number: '2' };
  const result: VisualIdentifyResponseDto = { candidates: [{ card, similarity: 0.8, retrievalRank: 1 }, { card: alternate, similarity: 0.7, retrievalRank: 2 }],
    retrievalLimit: 8, references: 20000, indexVersion: 'test', indexStale: false, collections: 175, indexMs: 1, cold: false, modelMs: 1, inferenceMs: 1, totalMs: 3 };
  mocks.recognize.mockImplementationOnce(async (_image: string, _signal: AbortSignal, onResult: (value: VisualIdentifyResponseDto) => void) => {
    onResult(result);
    return { card, score: 0.8, rawScore: 0.8, price: null, prices: [] };
  }).mockResolvedValueOnce(selected('latest'));
  render(<ScanPage />);
  upload();
  await screen.findByText('Sesión: 1');
  upload();
  await screen.findByText('Sesión: 2');
  fireEvent.click(screen.getByRole('button', { name: 'Revisar lectura 1' }));
  expect(await screen.findByAltText('Referencia de Primera')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Elegir Alternativa, set, número 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar esta carta' }));
  await waitFor(() => expect(JSON.stringify(sessionStorage)).toContain('alternate'));
  expect(JSON.stringify(sessionStorage)).toContain('latest');
  expect(JSON.stringify(sessionStorage)).not.toContain('data:image');
  expect(screen.getByText('Sesión: 2')).toBeInTheDocument();
  expect(mocks.recognize).toHaveBeenCalledTimes(2);
});
