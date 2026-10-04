// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CameraViewProps } from '../camera-view';
import type { IdlePanelProps } from '../idle-panel';
const mocks = vi.hoisted(() => {
  return { recognize: vi.fn(), toast: vi.fn() };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-mobile-camera', () => ({ useMobileCamera: () => true }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'test' } }) }));
vi.mock('@/lib/scanner/camera-visual', () => ({ recognizeCameraCard: mocks.recognize }));
vi.mock('@/lib/scanner/camera', async (original) => ({ ...await original<typeof import('@/lib/scanner/camera')>(), isCameraSupported: () => true, isSecureContextForCamera: () => true }));
vi.mock('@/components/ui', async (original) => ({ ...await original<typeof import('@/components/ui')>(), useToast: () => ({ info: mocks.toast, success: mocks.toast }) }));
vi.mock('@/components/scanner', async (original) => ({
  ...await original<typeof import('@/components/scanner')>(),
  IdlePanel: ({ onScan }: IdlePanelProps) => <button onClick={onScan}>Escanear carta</button>,
  CameraView: ({ autoVisual, onCapture, detected }: CameraViewProps) => <div>
    <p>{autoVisual ? 'Cámara automática' : 'Cámara manual'}</p>
    <button onClick={() => onCapture({ blob: new Blob(['x']), dataUrl: 'data:image/jpeg;base64,YQ==', width: 630, height: 880 }, 'auto')}>Carta estable</button>
    {detected ? <p>{detected.candidate.card.id} · {detected.candidate.price?.market}</p> : null}
  </div>,
  ScanResults: ({ open }: { open: boolean }) => open ? <div>Elegir candidato</div> : null,
  OrganizeSheet: () => null,
}));
import ScanPage from '@/app/(app)/escanear/page';

it('la cámara principal reconoce automáticamente y conserva carta/precio sin pedir selección', async () => {
  sessionStorage.clear();
  mocks.recognize.mockResolvedValue({ card: { id: 'me55-59', name: 'Toxtricity', setId: 'me55', number: '59' }, score: 0.636, rawScore: 0.636, price: { market: 1.5 } });
  render(<ScanPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Escanear carta' }));
  expect(screen.getByText('Cámara automática')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Carta estable' }));
  await screen.findByText('me55-59 · 1.5');
  expect(mocks.recognize).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Elegir candidato')).not.toBeInTheDocument();
  expect(screen.getByText('Cámara automática')).toBeInTheDocument();
});
