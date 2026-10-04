// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FaqSection } from '../faq-section';

describe('FaqSection', () => {
  it('explica los límites reales del escáner y la conectividad', async () => {
    const user = userEvent.setup();
    render(<FaqSection />);

    await user.click(screen.getByText('¿Cómo funciona el escáner y qué pasa con mi foto?'));
    expect(
      screen.getByText(/Se envía el recorte de tu foto a la API/),
    ).toBeVisible();

    await user.click(screen.getByText('¿PokéScan funciona sin conexión?'));
    expect(
      screen.getByText(/Consultar el catálogo, identificar una carta con DINOv2, actualizar precios/),
    ).toBeVisible();
  });

  it('no presenta Pro como disponible ni implica un cobro activo', async () => {
    const user = userEvent.setup();
    render(<FaqSection />);

    await user.click(screen.getByText('¿Qué incluye Gratis y qué incluiría Pro?'));

    expect(screen.getByText(/Hoy no hay pagos ni un plan Pro activo/)).toBeVisible();
    expect(screen.getByText(/No se te va a cobrar/)).toBeVisible();
  });

  it('la versión de página completa no duplica un enlace a la misma FAQ', () => {
    render(<FaqSection fullPage />);

    expect(screen.queryByRole('link', { name: 'Ver todas las preguntas' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Lo importante, sin letra chica.' })).toBeVisible();
  });
});
