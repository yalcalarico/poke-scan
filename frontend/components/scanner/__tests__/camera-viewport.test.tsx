// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CameraView } from '../camera-view';

vi.mock('@/lib/scanner/camera', async (original) => ({
  ...await original<typeof import('@/lib/scanner/camera')>(),
  startCamera: () => new Promise<MediaStream>(() => {}),
}));
afterEach(() => { vi.unstubAllGlobals(); document.body.style.overflow = ''; });

it('mantiene los controles dentro del viewport visible y restaura el scroll al cerrar', () => {
  const viewport = Object.assign(new EventTarget(), { height: 600, width: 390, offsetTop: 20, offsetLeft: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  document.body.style.overflow = 'auto';
  const noop = () => {};
  const { unmount } = render(<CameraView busy={false} detected={null} headline="" detail="" progress={null}
    previewUrl={null} sessionCount={0} onCapture={noop} onError={noop} onClose={noop}
    onPickFromGallery={noop} onDiscard={noop} onOrganize={noop} />);
  const camera = screen.getByLabelText('Vista de la cámara').parentElement?.parentElement;
  expect(camera).toHaveStyle({ height: '600px', width: '390px', top: '20px' });
  act(() => { viewport.height = 480; viewport.offsetTop = 0; viewport.dispatchEvent(new Event('resize')); });
  expect(camera).toHaveStyle({ height: '480px', top: '0px' });
  expect(document.body.style.overflow).toBe('hidden');
  unmount();
  expect(document.body.style.overflow).toBe('auto');
});
