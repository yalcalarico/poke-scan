// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CameraViewProps } from '../camera-view';
import type { OrganizeSheetProps } from '../organize-sheet';
import type { IdlePanelProps } from '../idle-panel';
import type { VisualIdentifyResponseDto } from '@/types/api';
import type { DiagnosticSession } from '@/lib/scanner/diagnostic-session';
const mocks = vi.hoisted(() => {
  return { recognize: vi.fn(), toast: vi.fn(), report: vi.fn(), playCoinSound: vi.fn(), unlockCoinSound: vi.fn() };
});
vi.mock('@/lib/scanner/coin-sound', () => ({ playCoinSound: mocks.playCoinSound, unlockCoinSound: mocks.unlockCoinSound }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-mobile-camera', () => ({ useMobileCamera: () => true }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'test' }, isAuthenticated: true, isLoading: false }) }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: (value: number | null | undefined) => value == null ? '—' : `USD ${value}` }) }));
vi.mock('@/lib/scanner/camera-visual', () => ({ recognizeCameraCard: mocks.recognize }));
vi.mock('@/lib/api/cards', async (original) => ({ ...await original<typeof import('@/lib/api/cards')>(), getSets: vi.fn(async () => []) }));
vi.mock('@/lib/scanner/diagnostic-report', async (original) => ({ ...await original<typeof import('@/lib/scanner/diagnostic-report')>(), downloadDiagnosticReport: mocks.report }));
vi.mock('@/lib/scanner/camera', async (original) => ({ ...await original<typeof import('@/lib/scanner/camera')>(), isCameraSupported: () => true, isSecureContextForCamera: () => true }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ info: mocks.toast, success: mocks.toast }) }));
vi.mock('@/components/scanner', async (original) => ({
  ...await original<typeof import('@/components/scanner')>(),
  IdlePanel: ({ onScan, sessionCount }: IdlePanelProps) => <><button onClick={onScan}>Escanear carta</button><p>Pendientes: {sessionCount}</p></>,
  CameraView: ({ autoVisual, onCapture, detected, onClose, diagnosticStatus, sessionCount, liveResult }: CameraViewProps) => <div>
    <button onClick={onClose}>Cerrar cámara</button>
    {diagnosticStatus ? <button onClick={diagnosticStatus.onOpen}>Ver opciones de diagnóstico</button> : null}
    <p>{autoVisual ? 'Cámara automática' : 'Cámara manual'}</p>
    <button onClick={() => onCapture({ blob: new Blob(['x']), dataUrl: 'data:image/jpeg;base64,YQ==', width: 630, height: 880 }, 'auto')}>Carta estable</button>
    <button onClick={() => onCapture({ blob: new Blob(['x']), dataUrl: 'data:image/jpeg;base64,YQ==', width: 630, height: 880 }, 'manual')}>Captura manual</button>
    <p>Sesión: {sessionCount}</p>
    {detected ? <p>{detected.candidate.card.id} · {detected.candidate.price?.market}</p> : null}
    {liveResult ? <p role="status">{liveResult}</p> : null}
  </div>,
  ScanResults: ({ open }: { open: boolean }) => open ? <div>Elegir candidato</div> : null,
  OrganizeSheet: ({ entries, onReview }: OrganizeSheetProps) => <>{entries.map((entry) => <button key={entry.runId} onClick={() => onReview?.(entry.runId)}>Revisar lectura {entry.runId}</button>)}</>,
}));
import ScanPage from '@/app/(app)/escanear/page';

it('la cámara principal reconoce automáticamente y conserva carta/precio sin pedir selección', async () => {
  sessionStorage.clear();
  mocks.recognize.mockResolvedValue({ card: { id: 'me55-59', name: 'Toxtricity', setId: 'me55', number: '59', imageSmall: '/card.png', imageLarge: '/card.png' }, score: 0.636, rawScore: 0.636, price: { market: 1.5 } });
  render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Escanear carta' }));
  expect(mocks.unlockCoinSound).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Cámara automática')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Carta estable' }));
  await screen.findByText('me55-59 · 1.5');
  expect(mocks.recognize).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Elegir candidato')).not.toBeInTheDocument();
  expect(screen.getByText('Cámara automática')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar cámara' }));
  expect(screen.getByText('¿Salir del escáner?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir escaneando' }));
  expect(screen.getByText('Cámara automática')).toBeInTheDocument();
  expect(screen.getByText('me55-59 · 1.5')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar cámara' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
  expect(screen.getByText('Pendientes: 1')).toBeInTheDocument();
  expect(screen.queryByText('me55-59 · 1.5')).not.toBeInTheDocument();
  expect(JSON.stringify(sessionStorage)).toContain('me55-59');
  fireEvent.click(screen.getByRole('button', { name: 'Revisar lectura 1' }));
  expect(screen.getByAltText('Tu captura de la carta')).toHaveAttribute('src', 'data:image/jpeg;base64,YQ==');
  expect(screen.getByAltText('Referencia de Toxtricity')).toBeInTheDocument();
});

it('emite una sola moneda cuando el resultado con precio cero queda visible, incluso si llegó tarde', async () => {
  sessionStorage.clear();
  mocks.playCoinSound.mockClear();
  let resolveRecognition: ((value: { card: { id: string; name: string; setId: string; number: string; imageSmall: string; imageLarge: string }; score: number; rawScore: number; price: { market: number } }) => void) | undefined;
  mocks.recognize.mockImplementationOnce(() => new Promise((resolve) => { resolveRecognition = resolve; }));
  const view = render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Escanear carta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Carta estable' }));
  expect(mocks.playCoinSound).not.toHaveBeenCalled();
  await waitFor(() => expect(resolveRecognition).toBeDefined());
  await act(async () => resolveRecognition?.({
    card: { id: 'zero-card', name: 'Carta cero', setId: 'test', number: '1', imageSmall: '', imageLarge: '' },
    score: .9, rawScore: .9, price: { market: 0 },
  }));
  await screen.findByText(/zero-card/);
  expect(mocks.playCoinSound).toHaveBeenCalledTimes(1);
  view.rerender(<ScanPage />);
  expect(mocks.playCoinSound).toHaveBeenCalledTimes(1);
});

it('no emite moneda para lecturas sin precio ni para errores', async () => {
  sessionStorage.clear();
  mocks.playCoinSound.mockClear();
  mocks.recognize.mockResolvedValueOnce({ card: { id: 'no-price', name: 'Sin precio', setId: 'test', number: '1', imageSmall: '', imageLarge: '' }, score: .9, rawScore: .9, price: null, prices: [] });
  const view = render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Escanear carta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Carta estable' }));
  await screen.findByText(/no-price/);
  expect(mocks.playCoinSound).not.toHaveBeenCalled();
  view.unmount();

  sessionStorage.clear();
  mocks.recognize.mockRejectedValueOnce(new Error('Falló el servicio'));
  render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Escanear carta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Carta estable' }));
  await waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
  expect(await screen.findByText('Falló el servicio')).toBeInTheDocument();
  expect(mocks.playCoinSound).not.toHaveBeenCalled();
});

it('mantiene y persiste más de 30 lecturas en la sesión', async () => {
  sessionStorage.clear();
  vi.clearAllMocks();
  const card = { id: 'long-session-card', name: 'Carta larga', setId: 'test', number: '1', imageSmall: '/card.png', imageLarge: '/card.png' };
  mocks.recognize.mockResolvedValue({ card, score: .9, rawScore: .9, price: null, prices: [] });
  render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Escanear carta' }));
  for (let count = 1; count <= 35; count += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Captura manual' }));
    await waitFor(() => expect(screen.getByText(`Sesión: ${count}`)).toBeInTheDocument());
  }
  const stored = JSON.parse(sessionStorage.getItem('pcs.scanDraft') ?? '{}') as { entries?: Array<{ runId: number }> };
  expect(stored.entries).toHaveLength(35);
  expect(stored.entries?.[0]?.runId).toBe(1);
  expect(stored.entries?.[34]?.runId).toBe(35);
  expect(mocks.recognize).toHaveBeenCalledTimes(35);
});

it('espera la respuesta y los precios antes de permitir finalizar desde las opciones de cámara', async () => {
  sessionStorage.clear();
  vi.clearAllMocks();
  const card = { id: 'test-card', name: 'Carta de prueba', setId: 'test-set', number: '1', imageSmall: '', imageLarge: '',
    supertype: 'Pokémon', subtypes: [], hp: null, types: [], rarity: null, artist: null };
  const result: VisualIdentifyResponseDto = { candidates: [{ card, similarity: .8, retrievalRank: 1 }], retrievalLimit: 8,
    references: 1, indexVersion: 'test', indexStale: false, collections: 1, indexMs: 1, cold: false, modelMs: 1, inferenceMs: 1, totalMs: 3 };
  let prediction: ((value: VisualIdentifyResponseDto) => void) | undefined;
  let finish: (() => void) | undefined;
  mocks.recognize.mockImplementationOnce((_image: string, _signal: AbortSignal, onResult: (value: VisualIdentifyResponseDto) => void) => {
    prediction = onResult;
    return new Promise((resolve) => { finish = () => resolve({ card, score: .8, rawScore: .8, price: null, prices: [] }); });
  });
  render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Configurar diagnóstico' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Iniciar diagnóstico' }));
  fireEvent.click(screen.getByRole('button', { name: 'Escanear carta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Carta estable' }));
  await waitFor(() => expect(prediction).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: 'Ver opciones de diagnóstico' }));
  expect(screen.getByRole('button', { name: 'Finalizar diagnóstico' })).toBeDisabled();
  act(() => prediction?.(result));
  expect(screen.getByRole('button', { name: 'Finalizar diagnóstico' })).toBeDisabled();
  await act(async () => finish?.());
  fireEvent.click(await screen.findByRole('button', { name: 'Ver opciones de diagnóstico' }));
  expect(screen.getByRole('button', { name: 'Finalizar diagnóstico' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar diagnóstico' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descargar informe HTML' }));
  const diagnostic = mocks.report.mock.calls[0][0] as DiagnosticSession;
  expect(diagnostic.pendingOperations).toBe(0);
  expect(diagnostic.readings[0].result).toEqual(result);
  expect(diagnostic.readings[0].events.map((event) => event.type)).toContain('prediction_received');
});
