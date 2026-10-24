// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/layout/bottom-nav';
import { AppVisualsProvider } from './visual-preview';

vi.mock('next/navigation', () => ({ usePathname: () => '/buscar' }));
afterEach(() => window.history.replaceState(null, '', '/'));

it.each(['', '?visual=classic', '?visual=v2'])('usa la misma apariencia y navegación con enlaces antiguos: %s', (query) => {
  window.history.replaceState(null, '', `/buscar${query}`);
  const { container } = render(<AppVisualsProvider><BottomNav /></AppVisualsProvider>);
  expect(container.querySelector('[data-visual-preview="v2"]')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Clásica' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Versión visual')).not.toBeInTheDocument();
  for (const [name, href] of [['Inicio', '/inicio'], ['Buscar', '/buscar'], ['Escanear', '/escanear'], ['Colecciones', '/colecciones'], ['Ajustes', '/ajustes']] as const) {
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  }
  expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('aria-current', 'page');
});
