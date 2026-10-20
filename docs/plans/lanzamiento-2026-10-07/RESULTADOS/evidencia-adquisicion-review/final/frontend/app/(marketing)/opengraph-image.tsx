import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

export const alt =
  'PokéScan: buscar cartas Pokémon, organizar colecciones y consultar referencias de mercado.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// ImageResponse no resuelve variables CSS: mantener estos valores del tema claro
// sincronizados con --canvas, --brand y --text-* de app/globals.css.
const LIGHT_TOKENS = {
  canvas: '#f4f4f6',
  brand: '#d81c23',
  textPrimary: '#0b0b0f',
  textSecondary: '#5c5c68',
} as const;

const iconData = readFile(join(process.cwd(), 'public/icons/icon-512.png')).then(
  (icon) => `data:image/png;base64,${icon.toString('base64')}`,
);

export default async function OpenGraphImage() {
  const icon = await iconData;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          backgroundColor: LIGHT_TOKENS.canvas,
          display: 'flex',
          height: '100%',
          padding: '64px',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            backgroundColor: LIGHT_TOKENS.brand,
            height: '12px',
            left: 0,
            position: 'absolute',
            top: 0,
            width: '100%',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: '20px' }}>
            <img
              alt=""
              height="76"
              src={icon}
              style={{ borderRadius: '20px' }}
              width="76"
            />
            <span
              style={{
                color: LIGHT_TOKENS.brand,
                fontSize: '30px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              PokéScan
            </span>
          </div>
          <div
            style={{
              color: LIGHT_TOKENS.textPrimary,
              fontSize: '58px',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.12,
              maxWidth: '1000px',
            }}
          >
            Tu colección Pokémon, ordenada carta por carta.
          </div>
          <div
            style={{
              color: LIGHT_TOKENS.textSecondary,
              fontSize: '28px',
              lineHeight: 1.35,
              maxWidth: '950px',
            }}
          >
            Buscá cartas, organizá tus sets y tené a mano tus duplicadas.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
