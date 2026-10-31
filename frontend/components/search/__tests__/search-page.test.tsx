// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BuscarPage from '@/app/(app)/buscar/page';
import Loading from '@/app/(app)/buscar/loading';
import { SearchPage, SearchWorkspace } from '../search-page';
import { SearchFallback } from '../search-fallback';

describe('Composición Buscar Viñeta', () => {
  it('usa el título del diseño y destinos reales sin header mobile redundante', () => {
    render(<SearchPage><SearchWorkspace><p>Resultados</p></SearchWorkspace></SearchPage>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Buscá tu próximo hallazgo.');
    expect(screen.getByText('Catálogo Pokémon')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Escanear carta' })).toHaveAttribute('href', '/escanear');
    const guide = screen.getByRole('complementary', { name: 'Explorar con intención' });
    expect(within(guide).getByRole('heading', { name: 'Encontrá la indicada' })).toBeInTheDocument();
    expect(within(guide).getByRole('link', { name: 'Ver objetivos' })).toHaveAttribute('href', '/colecciones');
    expect(screen.queryByRole('heading', { name: 'Buscar' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Búsqueda y filtros' })).toHaveTextContent('Resultados');
  });

  it('comparte header y guía durante la carga', () => {
    render(<Loading />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Buscá tu próximo hallazgo.');
    expect(screen.getByRole('complementary')).toHaveTextContent('Encontrá la indicada');
    const status = screen.getByRole('status', { name: 'Cargando el buscador' });
    expect(screen.getByRole('group', { name: 'Filtros del catálogo' })).toContainElement(status);
    expect(screen.getByRole('region', { name: 'Más opciones' })).toBeInTheDocument();
    expect(screen.queryByText('Colección', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/Buscar todavía no filtra por álbum/)).not.toBeInTheDocument();
  });

  it('la ruta y el fallback de Suspense usan el mismo marco', () => {
    const route = BuscarPage();
    expect(route.type).toBe(SearchPage);
    render(<SearchPage><SearchFallback /></SearchPage>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
  });
});
