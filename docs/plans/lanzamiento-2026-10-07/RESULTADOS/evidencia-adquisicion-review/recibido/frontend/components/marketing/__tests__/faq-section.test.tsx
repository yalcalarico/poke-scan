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
    expect(screen.getByText(/requiere cuenta y conexión/)).toBeVisible();
    expect(screen.getByText(/sin guardar la foto de consulta/)).toBeVisible();
    expect(screen.getByText(/puede ser incorrecta o no aparecer/)).toBeVisible();

    await user.click(screen.getByText('¿PokéScan funciona sin conexión?'));
    expect(
      screen.getByText(/Para buscar en el catálogo, reconocer cartas, consultar o sincronizar/),
    ).toBeVisible();
    expect(screen.getByText(/no garantiza que estén actualizadas/)).toBeVisible();
  });

  it('no presenta Pro como disponible ni implica un cobro activo', async () => {
    const user = userEvent.setup();
    render(<FaqSection />);

    await user.click(screen.getByText('¿Qué incluye Gratis y qué incluiría Pro?'));

    expect(screen.getByText(/Hoy no hay plan Pro activo ni pagos/)).toBeVisible();
    expect(screen.getByText(/exportación CSV básica están disponibles sin suscripción/)).toBeVisible();
    expect(screen.getByText(/Seguimiento automático y alertas no están disponibles/)).toBeVisible();
    expect(screen.getByText(/No hay precio ni fecha confirmados/)).toBeVisible();
  });

  it('la versión de página completa no duplica un enlace a la misma FAQ', () => {
    render(<FaqSection fullPage />);

    expect(screen.queryByRole('link', { name: 'Ver todas las preguntas' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Lo importante, sin letra chica.' })).toBeVisible();
  });

  it('mantiene los ocho destinos estables, incluido el ancla del CTA Pro', () => {
    render(<FaqSection fullPage />);

    expect(document.querySelectorAll('#faq details')).toHaveLength(8);
    expect(document.getElementById('faq-planes')).toBeInTheDocument();
    expect(document.getElementById('faq-precios')).toBeInTheDocument();
  });
});
