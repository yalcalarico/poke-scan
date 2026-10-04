import { correctedCardImages } from './card-image-overrides.js';
import corrections from './card-image-overrides.json' with { type: 'json' };

describe('Referencias corregidas del catálogo', () => {
  it('preserva las referencias verificadas ante URLs rotas del proveedor', () => {
    for (const [id, url] of Object.entries(corrections)) {
      expect(
        correctedCardImages(id, {
          imageSmall: 'https://images.pokemontcg.io/404.png',
          imageLarge: 'https://images.pokemontcg.io/404_hires.png',
        }),
      ).toEqual({ imageSmall: url, imageLarge: url });
    }
    expect(Object.keys(corrections)).toHaveLength(53);
  });

  it('conserva las URLs de cartas sin corrección', () => {
    const images = {
      imageSmall: 'https://images.pokemontcg.io/hsp/HGSS17.png',
      imageLarge: 'https://images.pokemontcg.io/hsp/HGSS17_hires.png',
    };
    expect(correctedCardImages('hsp-HGSS17', images)).toEqual(images);
  });
});
