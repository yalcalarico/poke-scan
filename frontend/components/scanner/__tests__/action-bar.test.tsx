// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar';

it('deja obturador y Continuar en la misma fila, sin controles laterales ni leyenda visible', () => {
  render(<ActionBar progress={null} headline="" detail="" previewUrl={null} sessionCount={2}
    canCapture onCapture={vi.fn()} onOrganize={vi.fn()} isCapturing={false} status="Encuadrá una carta." />);

  const shutter = screen.getByRole('button', { name: 'Tomar foto de la carta' });
  const organize = screen.getByRole('button', { name: 'Continuar (2)' });
  expect(shutter.parentElement).toBe(organize.parentElement);
  expect(screen.queryByRole('button', { name: 'Elegir una foto de la carta' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descartar la última lectura' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveClass('sr-only');
  expect(screen.getByRole('status')).toHaveTextContent('Encuadrá una carta.');
});
