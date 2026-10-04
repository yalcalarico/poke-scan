// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IdlePanel } from '@/components/scanner/idle-panel';
import { isPhoneBrowser } from '../use-mobile-camera';

 describe('cámara sólo en teléfonos', () => {
  it('reconoce iPhone y Android, pero no desktop ni tablets', () => {
    expect(isPhoneBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari')).toBe(true);
    expect(isPhoneBrowser('Mozilla/5.0 (Linux; Android 15; Pixel) Mobile Safari')).toBe(true);
    for (const agent of ['Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'Mozilla/5.0 (Windows NT 10.0)', 'Mozilla/5.0 (iPad; CPU OS 18_0) Mobile', 'Mozilla/5.0 (Linux; Android 15; Tablet) Safari']) {
      expect(isPhoneBrowser(agent)).toBe(false);
    }
  });
  it('ofrece fotos y búsqueda en escritorio sin botón de cámara', () => {
    render(<IdlePanel showCamera={false} cameraAvailable={false} sessionCount={0} onScan={vi.fn()} onPickFromGallery={vi.fn()} onManualSearch={vi.fn()} onOrganize={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Escanear carta$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir una foto' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Buscar a mano' })).toBeEnabled();
  });
});
