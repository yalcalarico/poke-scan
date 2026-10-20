import { describe, expect, it } from 'vitest';

import { acquisitionMetadata } from '../acquisition-metadata';

describe('metadata de adquisición', () => {
  it.each([
    {
      title: 'Tu colección Pokémon, ordenada carta por carta',
      description:
        'Buscá cartas, organizá tus sets y tené a mano tus duplicadas. Consultá referencias en USD o convertidas a ARS cuando hay datos.',
      canonical: '/',
    },
    {
      title: 'Preguntas frecuentes',
      description:
        'Cómo funciona el reconocimiento visual, de dónde salen las referencias de mercado y qué está disponible sin suscripción.',
      canonical: '/faq',
    },
  ])('publica metadata completa para $canonical', ({ title, description, canonical }) => {
    const metadata = acquisitionMetadata({ title, description, canonical });
    const imageAlt =
      'PokéScan: buscar cartas Pokémon, organizar colecciones y consultar referencias de mercado.';

    expect(metadata.title).toBe(title);
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.openGraph).toMatchObject({
      title: `${title} · PokéScan`,
      description,
      type: 'website',
      siteName: 'PokéScan',
      locale: 'es_AR',
      url: canonical,
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: `${title} · PokéScan`,
      description,
      images: [{ url: '/opengraph-image', alt: imageAlt }],
    });
    expect(new URL('/opengraph-image', 'http://127.0.0.1:3000').href).toBe(
      'http://127.0.0.1:3000/opengraph-image',
    );
  });
});
