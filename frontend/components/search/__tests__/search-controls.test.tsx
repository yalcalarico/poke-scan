// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchControls, type SearchControlsProps } from '../search-controls';

function props(): SearchControlsProps {
  return {
    value: '', onValueChange: vi.fn(), onSubmit: vi.fn(), searchBy: 'name',
    onSearchByChange: vi.fn(), setId: '', onSetIdChange: vi.fn(), rarity: '',
    onRarityChange: vi.fn(), sort: 'name', onSortChange: vi.fn(), direction: 'asc',
    onDirectionChange: vi.fn(), hasQuery: false, sets: [], onClearFilters: vi.fn(),
  };
}

describe('SearchControls', () => {
  it('elimina el filtro de colección y su explicación', () => {
    render(<SearchControls {...props()}><p>Resultados reales</p></SearchControls>);
    expect(screen.getByRole('searchbox', { name: 'Buscar por nombre' })).toHaveAttribute('placeholder', 'Probá con Pikachu');
    const panel = screen.getByRole('group', { name: 'Filtros del catálogo' });
    expect(screen.queryByRole('combobox', { name: 'Colección' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Buscar todavía no filtra por álbum/)).not.toBeInTheDocument();
    expect(within(panel).getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Resultados reales')).toBeInTheDocument();
  });

  it('muestra Más opciones en una tarjeta propia después de la guía y fuera de filtros', () => {
    render(<SearchControls {...props()} />);
    const guide = screen.getByRole('complementary', { name: 'Explorar con intención' });
    const options = screen.getByRole('region', { name: 'Más opciones' });
    const panel = screen.getByRole('group', { name: 'Filtros del catálogo' });
    expect(guide.parentElement).toBe(options.parentElement);
    expect(guide.nextElementSibling).toBe(options);
    expect(panel).not.toContainElement(options);
    expect(options.querySelector('details')).toBeNull();
    expect(within(options).getByRole('button', { name: 'Artista' })).toBeVisible();
    expect(within(options).getByRole('button', { name: 'Special Illustration Rare' })).toBeVisible();
  });

  it('ubica el formulario y campo por nombre dentro de la tarjeta de búsqueda', () => {
    render(<SearchControls {...props()} />);
    const panel = screen.getByRole('group', { name: 'Filtros del catálogo' });
    expect(within(panel).getByRole('search')).toContainElement(screen.getByRole('searchbox', { name: 'Buscar por nombre' }));
  });

  it('conserva texto al cambiar de campo y separa envío, limpiar búsqueda y filtros', () => {
    const controls = { ...props(), value: 'Ken' };
    const { rerender } = render(<SearchControls {...controls} />);
    fireEvent.click(screen.getByRole('button', { name: 'Artista' }));
    expect(controls.onSearchByChange).toHaveBeenCalledWith('artist');
    expect(controls.onValueChange).not.toHaveBeenCalled();
    rerender(<SearchControls {...controls} searchBy="artist" />);
    expect(screen.getByRole('searchbox', { name: 'Buscar por artista' })).toHaveValue('Ken');
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Buscá por artista: Sugimori, Ken…');
    fireEvent.submit(screen.getByRole('search'));
    expect(controls.onSubmit).toHaveBeenCalledExactlyOnceWith();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(controls.onClearFilters).toHaveBeenCalledExactlyOnceWith();
    expect(controls.onValueChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(controls.onValueChange).toHaveBeenCalledExactlyOnceWith('');
    rerender(<SearchControls {...controls} searchBy="number" />);
    expect(screen.getByRole('searchbox', { name: 'Buscar por número' })).toHaveAttribute('placeholder', 'Buscá por número: 4, 25/102, 4a…');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '25/102' } });
    expect(controls.onValueChange).toHaveBeenLastCalledWith('25/102');
  });

  it('aplica rareza inmediatamente desde Más opciones', () => {
    const controls = props();
    render(<SearchControls {...controls} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rare Holo' }));
    expect(controls.onRarityChange).toHaveBeenCalledExactlyOnceWith('Rare Holo');
  });

  it('quita chips de set y rareza, y no ofrece orden ficticio con query', () => {
    const controls = { ...props(), setId: 'synthetic', rarity: 'Rare', hasQuery: true };
    render(<SearchControls {...controls} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro de expansión: synthetic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro de rareza: Rare' }));
    expect(controls.onSetIdChange).toHaveBeenCalledWith('');
    expect(controls.onRarityChange).toHaveBeenCalledWith('');
    expect(screen.getByText(/Por relevancia\. Quitá/)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Sentido' })).toBeDisabled();
  });

  it('conserva los criterios reales, callbacks y estados de carga/error de sets', () => {
    const controls = props();
    const { rerender } = render(<SearchControls {...controls} />);
    const order = screen.getByRole('combobox', { name: 'Ordenar por' });
    expect(within(order).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['name', 'price', 'rarity', 'number']);
    fireEvent.change(order, { target: { value: 'price' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sentido' }), { target: { value: 'desc' } });
    expect(controls.onSortChange).toHaveBeenCalledWith('price');
    expect(controls.onDirectionChange).toHaveBeenCalledWith('desc');
    fireEvent.change(screen.getByRole('combobox', { name: 'Set / expansión' }), { target: { value: '' } });
    expect(controls.onSetIdChange).toHaveBeenCalledWith('');
    rerender(<SearchControls {...controls} setsLoading />);
    expect(screen.getByRole('combobox', { name: 'Set / expansión' })).toBeDisabled();
    expect(screen.getByText('Cargando expansiones…')).toBeVisible();
    rerender(<SearchControls {...controls} setsError="Error sintético" />);
    expect(screen.getByRole('combobox', { name: 'Set / expansión' })).toBeDisabled();
    expect(screen.getByText(/No pudimos cargar las expansiones/)).toBeVisible();
  });
});
