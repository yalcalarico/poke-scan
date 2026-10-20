// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CaptureQuality } from '@/lib/scanner/capture-quality';

import { CaptureQualityNotice } from '../capture-quality-notice';

function quality(warnings: CaptureQuality['warnings']): CaptureQuality {
  return {
    schemaVersion: 1,
    analysisWidth: 180,
    analysisHeight: 252,
    laplacianVariance: 10,
    brightFraction: 0.1,
    largestBrightRegionFraction: 0.05,
    warnings,
  };
}

describe('Consejos orientativos de captura', () => {
  it.each([undefined, quality([])])('no certifica calidad si no hay advertencias (%s)', (capture) => {
    const { container } = render(<CaptureQualityNotice quality={capture} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('aconseja enfoque sin interrumpir ni agregar acciones', () => {
    render(<CaptureQualityNotice quality={quality(['blur'])} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Puede faltar enfoque/)).toBeInTheDocument();
    expect(screen.queryByText(/Puede haber reflejos/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Podés seguir revisando/)).toBeInTheDocument();
  });

  it('muestra el consejo de luz sólo cuando corresponde', () => {
    render(<CaptureQualityNotice quality={quality(['glare'])} />);
    expect(screen.getByText(/Puede haber reflejos/)).toBeInTheDocument();
    expect(screen.queryByText(/Puede faltar enfoque/)).not.toBeInTheDocument();
    expect(screen.getByText(/experimental/)).toBeInTheDocument();
    expect(screen.getByText(/el diseño de la carta puede activarlas/)).toBeInTheDocument();
  });

  it('mantiene ambos consejos en un aviso cuando aparecen juntos', () => {
    render(<CaptureQualityNotice quality={quality(['blur', 'glare'])} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByText(/Puede faltar enfoque/)).toBeInTheDocument();
    expect(screen.getByText(/Puede haber reflejos/)).toBeInTheDocument();
  });
});
