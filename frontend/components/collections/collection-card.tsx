import Image from 'next/image';
import Link from 'next/link';
import { Grid3x3, Layers } from 'lucide-react';

import { Money } from '@/components/cards/money';
import { Badge, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import type { CollectionDto } from '@/types/api';

import { formatCount } from './collection-options';
import styles from './collections.module.css';

/** Las miniaturas son decorativas: el enlace ya tiene el nombre del álbum. */
export interface CollectionCoverItem {
  imageSmall: string;
}

export interface CollectionCardProps {
  collection: CollectionDto;
  /** Portada agregada de la API; nunca se pide una carta por tarjeta. */
  cover?: readonly CollectionCoverItem[];
  className?: string;
}

export function CollectionCard({ collection, cover, className }: CollectionCardProps) {
  const titleId = `coleccion-${collection.id}`;
  const images = (cover ?? []).slice(0, 4);
  const href = `/colecciones/${encodeURIComponent(collection.id)}`;

  return (
    <article className={cn(styles.album, className)} aria-labelledby={titleId}>
      <div className={styles.cover} aria-hidden="true">
        {images.length ? images.map((image, index) => (
          <div key={`${image.imageSmall}-${index}`} className={styles.coverImage}>
            <Image src={image.imageSmall} alt="" fill sizes="72px" className="object-contain" />
          </div>
        )) : <div className="flex flex-col items-center gap-2 text-secondary">
          <Layers aria-hidden="true" className="size-8" />
          <p className="text-caption">Colección vacía</p>
        </div>}
      </div>
      <div className={styles.albumInfo}>
        {collection.isDefault ? <Badge tone="brand" className="self-start">Principal</Badge> : null}
        <h2 id={titleId} className={styles.albumTitle}>
          <Link href={href} title={collection.name}>{collection.name}</Link>
        </h2>
        <p className="text-caption text-secondary tabular-nums">
          {formatCount(collection.itemCount)} {pluralize(collection.itemCount, 'carta', 'cartas')}
        </p>
        <p className="text-caption text-secondary tabular-nums">
          {formatCount(collection.uniqueCount)} únicas · {formatCount(collection.duplicateCount)} duplicadas
        </p>
        <div className="text-caption text-secondary tabular-nums">
          {collection.valuation ? <Money usd={collection.valuation.amount} tone={collection.valuation.amount === null ? 'default' : 'positive'} size="md" /> : <span className="text-warning">Valuación no disponible</span>}
        </div>
        {collection.valuation && collection.valuation.coverage.unpricedCopies > 0 ? (
          <p className="text-caption text-secondary">
            {collection.valuation.coverage.pricedCopies > 0 ? 'Subtotal de cartas con precio' : 'Sin cartas con precio'}
          </p>
        ) : null}
      </div>
      <div className={styles.albumFooter}>
        <Link href={href} aria-label={`Abrir colección ${collection.name}`} className={buttonVariants({ variant: 'secondary' })}>Abrir colección</Link>
        <Link href={`${href}/objetivos`} aria-label={`Ver objetivos de ${collection.name}`} className={buttonVariants({ variant: 'secondary' })}>Ver objetivos</Link>
        <Link href="/escanear" aria-label={`Sumar cartas a ${collection.name}`} className={buttonVariants({ variant: 'ghost' })}>Sumar cartas</Link>
        <Link href={`${href}/sets`} aria-label={`Progreso por set de ${collection.name}`} className={buttonVariants({ variant: 'ghost' })}>
          <Grid3x3 aria-hidden="true" focusable="false" strokeWidth={1.75} className="h-4 w-4" />
          Progreso por set
        </Link>
      </div>
    </article>
  );
}
