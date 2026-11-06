// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { IdlePanel } from '../idle-panel';
import { ScannerLayout } from '../scanner-layout';
import ScanLoading from '@/app/(app)/escanear/loading';

const callbacks = () => ({ onScan: vi.fn(), onPickFromGallery: vi.fn(), onManualSearch: vi.fn(), onOrganize: vi.fn() });

it('presenta un único encabezado editorial, retorno y dos paneles sin simular resultados', () => {
  const actions = callbacks();
  render(<ScannerLayout><IdlePanel showCamera={false} cameraAvailable={false} sessionCount={0} {...actions} /></ScannerLayout>);
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'De carta a colección.' })).toBeInTheDocument();
  expect(screen.getByText('Recorrido de escaneo')).toBeInTheDocument();
  expect(screen.getByText('Capturar, revisar y guardar son pasos distintos.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/inicio');
  expect(screen.getByRole('region', { name: 'Encuadre de captura' })).toHaveTextContent('Encuadre ilustrado · Cámara apagada');
  const controls = screen.getByRole('region', { name: 'Opciones de captura' });
  expect(within(controls).getByRole('heading', { name: 'Una captura. Una decisión clara.' })).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Pasos del escaneo' }).children).toHaveLength(3);
  for (const text of ['Capturá', 'Revisá', 'Guardá', 'Iniciá la lectura', 'Confirmá identidad', 'Elegí colección']) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Escanear carta' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /muestra/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/Pikachu|Demostración sin cámara/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Subir una foto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Buscar a mano' }));
  expect(actions.onPickFromGallery).toHaveBeenCalledOnce();
  expect(actions.onManualSearch).toHaveBeenCalledOnce();
  expect(actions.onScan).not.toHaveBeenCalled();
  expect(actions.onOrganize).not.toHaveBeenCalled();
});

it('conserva cámara de teléfono, subida, búsqueda y organización con sus callbacks', () => {
  const actions = callbacks();
  const view = render(<IdlePanel cameraAvailable sessionCount={2} {...actions} />);
  expect(screen.getByRole('status')).toHaveTextContent('2 cartas pendientes de organizar');
  for (const [name, callback] of [['Escanear carta', actions.onScan], ['Subir una foto', actions.onPickFromGallery], ['Buscar a mano', actions.onManualSearch], ['Organizar la sesión (2)', actions.onOrganize]] as const) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(callback).toHaveBeenCalledOnce();
  }
  view.rerender(<IdlePanel cameraAvailable={false} sessionCount={0} {...actions} />);
  expect(screen.getByRole('button', { name: 'Escanear carta' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Subir una foto' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Buscar a mano' })).toBeEnabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('la carga comparte encabezado y columnas, sin cámara ni carta de muestra', () => {
  render(<ScanLoading />);
  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('heading', { name: 'De carta a colección.' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Preparando el escáner' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Encuadre de captura' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Opciones de captura' })).toBeInTheDocument();
  expect(screen.queryByText('Encuadre ilustrado · Cámara apagada')).not.toBeInTheDocument();
});
