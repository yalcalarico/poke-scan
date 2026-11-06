// @vitest-environment jsdom
import React, { type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/(app)/ajustes/page';
import SettingsLoading from '@/app/(app)/ajustes/loading';

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: {
  displayName: 'Coleccionista sintético', email: 'collector@example.invalid', username: 'collector',
  avatarUrl: null, createdAt: '2000-01-01T00:00:00.000Z',
} }) }));
vi.mock('@/hooks/use-async', () => ({ useAsync: () => ({ status: 'ready', data: [
  { id: 'synthetic-album', name: 'Álbum sintético' },
] }) }));
vi.mock('@/components/settings', async () => {
  const { IdentityCard } = await import('../identity-card');
  return {
    IdentityCard,
    RequireAuth: ({ children }: { children: ReactNode }) => <>{children}</>,
    AppearanceSettings: () => <section aria-label="Apariencia real">Cambiar tema</section>,
    CurrencySettings: () => <section aria-label="Moneda real">Moneda de los precios</section>,
    SessionSettings: () => <button>Cerrar sesión</button>,
    AccountDeletionSettings: () => <a href="/eliminar-cuenta">Revisar eliminación</a>,
  };
});
vi.mock('@/components/share/share-links-section', () => ({ ShareLinksSection: () => <section aria-label="Enlaces reales">Administrar enlaces compartidos</section> }));

describe('Ajustes Viñeta', () => {
  it('presenta encabezado editorial e identidad reales antes de los paneles', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu cuenta, en orden.');
    expect(screen.getByText('Cuenta y preferencias')).toBeVisible();
    expect(screen.getByRole('link', { name: /^Volver$/ })).toHaveAttribute('href', '/inicio');
    expect(screen.getByText('Coleccionista sintético')).toBeVisible();
    expect(screen.getByText('collector@example.invalid')).toBeVisible();
    expect(screen.queryByText(/Sin cuenta conectada/)).not.toBeInTheDocument();
  });

  it('agrupa como el diseño y conserva los accesos y preferencias de la cuenta', () => {
    render(<SettingsPage />);
    const left = screen.getByRole('region', { name: 'Cuenta y colecciones' });
    const right = screen.getByRole('region', { name: 'Preferencias y privacidad' });
    expect(within(left).getByText('Perfil y seguridad')).toBeVisible();
    expect(within(left).getByRole('link', { name: 'Editar datos' })).toHaveAttribute('href', '/ajustes/perfil');
    expect(within(left).getByRole('link', { name: 'Cambiar clave' })).toHaveAttribute('href', '/ajustes/clave');
    expect(within(left).getByRole('link', { name: /Álbum sintético/ })).toHaveAttribute('href', '/colecciones/synthetic-album');
    expect(within(left).getByRole('link', { name: 'Administrar colecciones' })).toHaveAttribute('href', '/colecciones');
    expect(within(right).getByText('PRO · Próximamente')).toBeVisible();
    expect(within(right).getByRole('heading', { name: 'Privacidad y políticas' })).toBeVisible();
    expect(within(right).getByRole('region', { name: 'Enlaces reales' })).toBeVisible();
    const preferences = within(right).getByRole('region', { name: 'Preferencias y cuenta' });
    expect(within(preferences).getByRole('region', { name: 'Apariencia real' })).toBeVisible();
    expect(within(preferences).getByRole('region', { name: 'Moneda real' })).toBeVisible();
    expect(within(preferences).getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    expect(within(preferences).getByRole('link', { name: 'Revisar eliminación' })).toHaveAttribute('href', '/eliminar-cuenta');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reiniciar muestra/ })).not.toBeInTheDocument();
  });

  it('mantiene el encabezado y las dos columnas semánticas durante la carga', () => {
    render(<SettingsLoading />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu cuenta, en orden.');
    expect(screen.getByRole('region', { name: 'Cuenta y colecciones' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Preferencias y privacidad' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Cargando tus ajustes' })).toBeInTheDocument();
  });
});
