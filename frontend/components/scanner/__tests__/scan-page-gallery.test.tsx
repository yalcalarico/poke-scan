// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IdlePanelProps } from '../idle-panel';
const mocks = vi.hoisted(() => ({ recognize: vi.fn(), prepare: vi.fn(), close: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/scanner/capture-review', () => ({ downloadCaptureReview: mocks.download }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-mobile-camera', () => ({ useMobileCamera: () => false }));
vi.mock('@/lib/scanner/camera-visual', () => ({ recognizeCameraCard: mocks.recognize }));
vi.mock('@/lib/scanner/visual-photo', () => ({ prepareVisualPhoto: mocks.prepare }));
vi.mock('@/components/scanner/visual-diagnostics', () => ({ VisualDiagnostics: () => null }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ info: vi.fn() }) }));
vi.mock('@/components/scanner', async (original) => ({
  ...await original<typeof import('@/components/scanner')>(),
  IdlePanel: ({ sessionCount }: IdlePanelProps) => <p>Sesión: {sessionCount}</p>,
  DetectedCardBar: ({ candidate }: { candidate: { card: { id: string } } }) => <p>{candidate.card.id}</p>,
  OrganizeSheet: () => null,
}));
import ScanPage from '@/app/(app)/escanear/page';
const selected = (id: string) => ({ card: { id, name: 'Toxtricity', setId: 'me55', number: '59' }, score: 0.7, rawScore: 0.7, price: null });
function upload() {
  fireEvent.change(screen.getByLabelText('Elegir una foto de la carta'), { target: { files: [new File(['x'], 'carta.png', { type: 'image/png' })] } });
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL: vi.fn() }));
  mocks.prepare.mockResolvedValue({ image: 'data:image/png;base64,YQ==', source: { highResolutionSource: { close: mocks.close } } });
});
it('la foto subida usa DINOv2, suma el candidato elegido y libera la imagen original', async () => {
  mocks.recognize.mockResolvedValue(selected('me55-59'));
  render(<ScanPage />);
  await screen.findByText('Sesión: 0');
  upload();
  await screen.findByText('me55-59');
  expect(screen.getByText('Sesión: 1')).toBeInTheDocument();
  expect(mocks.recognize).toHaveBeenCalledWith('data:image/png;base64,YQ==', expect.any(AbortSignal), expect.any(Function));
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Descargar recorte' }));
  expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ image: 'data:image/png;base64,YQ==', source: 'gallery', result: null }), 'image');
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
  await screen.findByText('me55-59');
  finish(selected('swsh8-108'));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Sesión: 1')).toBeInTheDocument();
  expect(screen.queryByText('swsh8-108')).not.toBeInTheDocument();
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
