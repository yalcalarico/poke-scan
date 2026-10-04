import overrides from '../src/catalog/card-image-overrides.json' with { type: 'json' };

export function referenceUrl(card) {
  return card.imageLarge ?? card.imageSmall;
}

export function isAllowedReference(cardId, url) {
  const parsed = new URL(url);
  return (
    parsed.protocol === 'https:' &&
    (['images.pokemontcg.io', 'images.scrydex.com'].includes(parsed.hostname) ||
      (Object.hasOwn(overrides, cardId) && url === overrides[cardId]))
  );
}
