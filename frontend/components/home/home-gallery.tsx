"use client";

import Image from "next/image";
import Link from "next/link";
import { ErrorState } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useAsync } from "@/hooks/use-async";
import { listCollections, listItems } from "@/lib/api/collections";
import type { CardDto } from "@/types/api";
import styles from "./home-screen.module.css";

function GalleryCards({ cards }: { cards: readonly CardDto[] }) {
  return <div className={styles.cards}>
    {cards.slice(0, 4).map(card => <Link key={card.id}
      href={`/carta/${encodeURIComponent(card.id)}`} className={styles.tile}>
      <Image src={card.imageLarge || card.imageSmall} alt={`Carta ${card.name}`}
        width={252} height={352} sizes="(max-width: 700px) 42vw, 180px" />
      <h3>{card.name}</h3>
      <span className="text-caption text-secondary">{card.set?.name ?? card.setId}</span>
    </Link>)}
    {cards.length < 4 && <Link className={styles.missing} href="/escanear">
      <span aria-hidden="true">＋</span><b>Tu próximo hallazgo</b><span>Escaneá una carta</span>
    </Link>}
  </div>;
}

export function HomeGallery({ guestCards }: { guestCards: readonly CardDto[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <p role="status">Cargando tu vitrina…</p>;
  if (isAuthenticated && user) return <OwnedGallery key={user.id} />;
  return <><p className="text-caption text-secondary">Un vistazo al catálogo, no a tu inventario.</p><GalleryCards cards={guestCards} /></>;
}

function OwnedGallery() {
  const result = useAsync(async signal => {
    const collections = await listCollections();
    const collection = collections.find(entry => entry.isDefault) ?? collections[0];
    if (!collection) return null;
    const items = await listItems(collection.id, { pageSize: 4 }, signal);
    const unique = [...new Map(items.data.map(item => [item.card.id, item.card])).values()];
    return { collection, cards: unique };
  }, []);
  if (result.status === "loading") return <p role="status">Cargando tus cartas…</p>;
  if (result.status === "error") return <ErrorState message={result.error ?? undefined} onRetry={result.reload} />;
  return <>
    <p className="text-caption text-secondary">{result.data ? result.data.collection.name : "Creá una colección para empezar tu vitrina."}</p>
    <GalleryCards cards={result.data?.cards ?? []} />
  </>;
}
