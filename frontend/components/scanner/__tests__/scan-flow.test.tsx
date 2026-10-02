// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScanPage from '@/app/(app)/escanear/page';
import { findRememberedCard } from '@/lib/scanner/memory';
import type { CardDto, CollectionDto, IdentifiedCandidateDto } from '@/types/api';
import type { ParsedScan } from '@/lib/scanner/types';

const mocks = vi.hoisted(() => ({
  identify: vi.fn(), getCard: vi.fn(), addItem: vi.fn(), listCollections: vi.fn(), scan: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'qa-stage-one' } }) }));
vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => ({ formatMoney: (value: number) => String(value) }) }));
vi.mock('@/components/ui', async (original) => ({
  ...(await original<typeof import('@/components/ui')>()), useToast: () => mocks.toast,
}));
vi.mock('@/lib/api/identify', async (original) => ({
  ...(await original<typeof import('@/lib/api/identify')>()), identifyCard: mocks.identify,
}));
vi.mock('@/lib/api/cards', async (original) => ({
  ...(await original<typeof import('@/lib/api/cards')>()), getCard: mocks.getCard,
}));
vi.mock('@/lib/api/collections', () => ({ addItem: mocks.addItem, listCollections: mocks.listCollections }));
vi.mock('@/lib/scanner/config', () => ({
  createScannerConfigLoader: () => async () => ({ setCodes: ['30C'], setNames: ['30th Celebration'] }),
}));
vi.mock('@/lib/scanner/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/scanner/pipeline')>()), scanCardImage: mocks.scan,
}));
vi.mock('@/components/scanner', async (original) => ({
  ...(await original<typeof import('@/components/scanner')>()), fileToImageData: async () => ({}),
}));
vi.mock('@/components/scanner/card-thumb', () => ({ CardThumb: () => null }));

const parsed: ParsedScan = {
  lines: ['=X Umbreon €X _', 'Lunatic Claw 100 damage'], nameGuess: 'Umbreon ex',
  numberGuess: '92', printedNumberGuess: '092/128', setHint: null, setCode: null, confidence: 0.45,
};
function card(id: string, name: string, number: string): CardDto {
  return { id, name, number, setId: 'me55', supertype: 'Pokémon', hp: '270',
    subtypes: [], types: [], rarity: null, artist: null, imageSmall: '', imageLarge: '' };
}
const exact = card('me55-92', 'Umbreon ex', '92');
function candidate(card: CardDto): IdentifiedCandidateDto {
  return { card, score: 1, rawScore: 1, price: null,
    signals: { numberHint: null, setCode: null, setName: null, printedNumber: null,
      hp: null, artist: null, rarity: null } };
}
const destination: CollectionDto = {
  id: 'qa-destination', userId: 'qa-stage-one', name: 'QA temporal', isDefault: true,
  itemCount: 0, uniqueCount: 0, duplicateCount: 0, totalValueUsd: 0, totalValueArs: null,
  cover: [], createdAt: '2026-10-01',
};
async function upload() {
  fireEvent.change(screen.getByLabelText('Elegir una foto de la carta'), {
    target: { files: [new File(['qa'], 'qa.png', { type: 'image/png' })] },
  });
  await screen.findByRole('dialog', { name: 'Coincidencias' });
}
async function chooseExact() {
  const row = screen.getByText('Umbreon ex', { exact: true }).closest('li');
  if (!row) throw new Error('No se mostró la candidata correcta.');
  await userEvent.click(within(row).getByRole('button', { name: 'Sumar a la sesión' }));
  await screen.findByRole('button', { name: 'Organizar la sesión' });
  expect(mocks.toast.success).toHaveBeenCalledWith(
    'Sumamos Umbreon ex a la sesión. Tocá “Organizar la sesión” para guardarla en tu colección.',
  );
}
async function save(quantity: number) {
  await userEvent.click(screen.getByRole('button', { name: 'Organizar la sesión' }));
  const field = await screen.findByRole('spinbutton', { name: 'Cantidad' });
  fireEvent.change(field, { target: { value: String(quantity) } });
  await userEvent.click(screen.getByRole('button', { name: 'Agregar todas (1)' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Organizar la sesión' })).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:qa') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  mocks.scan.mockResolvedValue({ lines: parsed.lines, parsed });
  mocks.identify.mockImplementation(async () => ({ status: 'ambiguous', totalCandidates: 2,
    extracted: { name: 'Umbreon', number: null, setHint: 'Dark Explorers' },
    candidates: [candidate(card('me55-91', 'Umbreon', '91')), candidate(exact)] }));
  mocks.getCard.mockResolvedValue(exact);
  mocks.listCollections.mockResolvedValue([destination]);
});

describe('etapa 1: página, elección, organización y memoria', () => {
  it('no suma la ambigua sola; guarda la elección y vuelve a sumar una copia', async () => {
    let quantity = 0;
    mocks.addItem.mockImplementation(async (_id: string, payload: { quantity: number }) => {
      quantity += payload.quantity; return { quantity };
    });
    render(<ScanPage />);
    await upload();
    expect(screen.getByText('Detectamos: Umbreon ex')).toBeInTheDocument();
    expect(screen.getByText('Colección sugerida: Dark Explorers · Número detectado: 092/128')).toBeInTheDocument();
    expect(sessionStorage.getItem('pcs.scanSession')).toBeNull();
    await chooseExact(); await save(2);
    expect(mocks.addItem).toHaveBeenLastCalledWith('qa-destination', { cardId: 'me55-92', quantity: 2 });
    await upload(); await chooseExact(); await save(1);
    expect(quantity).toBe(3);
    expect(mocks.addItem).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem('pcs.scanSession')).toBeNull();
  });

  it('recuerda sólo con consentimiento, recupera el ID y deja de proponerlo al borrar', async () => {
    mocks.addItem.mockResolvedValue({ quantity: 1 });
    render(<ScanPage />);
    await upload();
    expect(findRememberedCard('qa-stage-one', parsed)).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: /Recordar esta lectura/ }));
    await chooseExact(); await save(1);
    expect(findRememberedCard('qa-stage-one', parsed)).toBe('me55-92');
    expect(findRememberedCard('other-user', parsed)).toBeNull();
    await upload();
    await screen.findByText(/Corrección recordada en este dispositivo/);
    expect(mocks.getCard).toHaveBeenCalledWith('me55-92');
    await userEvent.click(screen.getByRole('button', { name: 'Borrar lecturas recordadas' }));
    expect(findRememberedCard('qa-stage-one', parsed)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Seguir escaneando' }));
    await upload();
    expect(screen.queryByText(/Corrección recordada en este dispositivo/)).not.toBeInTheDocument();
    expect(mocks.getCard).toHaveBeenCalledTimes(1);
  });
});
