import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pokescan.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/buscar`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/faq`, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
