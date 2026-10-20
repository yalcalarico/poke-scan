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
  it('permite cambiar el campo junto al input sin abrir filtros', () => {
    const controls = props();
    render(<SearchControls {...controls} />);
    fireEvent.click(screen.getByRole('button', { name: 'Artista' }));
    expect(controls.onSearchByChange).toHaveBeenCalledWith('artist');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('aplica rareza inmediatamente y Ver resultados solo cierra el panel', async () => {
    const controls = props();
    render(<SearchControls {...controls} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Los cambios se aplican al elegirlos.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rare Holo' }));
    expect(controls.onRarityChange).toHaveBeenCalledExactlyOnceWith('Rare Holo');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ver resultados' }));
    expect(controls.onRarityChange).toHaveBeenCalledTimes(1);
  });

  it('permite quitar filtros activos y explica el orden por relevancia', async () => {
    const controls = { ...props(), rarity: 'Rare', hasQuery: true };
    render(<SearchControls {...controls} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro de rareza: Rare' }));
    expect(controls.onRarityChange).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: 'Filtros: 1 activos' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Por relevancia/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: 'Ordenar resultados por' })).not.toBeInTheDocument();
  });
});
