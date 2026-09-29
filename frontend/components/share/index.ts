/**
 * API pública de `components/share/`.
 *
 * Dos bloques distintos que conviven en la misma carpeta y **no se deben
 * importar cruzados**:
 *
 * - Los de la *cuenta* (`ShareLinksSection`, `ShareLinkCard`, `ShareLinkCreator`)
 *   son client components y solo se usan en Ajustes.
 * - Los de la *landing* (`PublicCollectionView`, `InstallCta`) son de la ruta
 *   pública, que no pasa por el layout de `(app)`.
 *
 * `share-link-status.ts` y `copy-to-clipboard.ts` son lo único server-safe, y
 * por eso viven acá y no dentro de un componente client.
 */

// ─── Cuenta (client) ───
export { ShareLinkCard, type ShareLinkCardProps } from './share-link-card';
export { ShareLinkCreator, type ShareLinkCreatorProps } from './share-link-creator';
export { ShareLinksSection } from './share-links-section';
export { useCopyToClipboard, type CopyOptions } from './use-copy-to-clipboard';
export { useShareUrl } from './use-share-url';

// ─── Landing pública ───
export { InstallCta } from './install-cta';
export {
  PublicCollectionView,
  MAX_PUBLIC_ITEMS,
  type PublicCollectionViewProps,
} from './public-collection-view';

// ─── Server-safe ───
export { copyToClipboard } from './copy-to-clipboard';
export {
  isShareLinkExpired,
  shareLinkStatus,
  type ShareLinkState,
  type ShareLinkStatus,
  type ShareLinkStatusOptions,
} from './share-link-status';
