import type { Metadata } from 'next';

const IMAGE_PATH = '/opengraph-image';
const IMAGE_ALT =
  'PokéScan: buscar cartas Pokémon, organizar colecciones y consultar referencias de mercado.';

type AcquisitionMetadataInput = {
  title: string;
  description: string;
  canonical: string;
};

export function acquisitionMetadata({
  title,
  description,
  canonical,
}: AcquisitionMetadataInput): Metadata {
  const socialTitle = `${title} · PokéScan`;

  return {
    title,
    description,
    openGraph: {
      title: socialTitle,
      description,
      type: 'website',
      siteName: 'PokéScan',
      locale: 'es_AR',
      url: canonical,
      images: [
        {
          url: IMAGE_PATH,
          width: 1200,
          height: 630,
          type: 'image/png',
          alt: IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [{ url: IMAGE_PATH, alt: IMAGE_ALT }],
    },
    alternates: { canonical },
  };
}
