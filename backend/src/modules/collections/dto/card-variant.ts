export const CARD_VARIANTS = [
  'normal',
  'holofoil',
  'reverseHolofoil',
  'firstEditionNormal',
  'firstEditionHolofoil',
  'firstEdition',
  'unlimited',
  'unlimitedHolofoil',
] as const;

export type CardVariant = (typeof CARD_VARIANTS)[number];

export const CARD_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DM'] as const;

export type CardCondition = (typeof CARD_CONDITIONS)[number];
