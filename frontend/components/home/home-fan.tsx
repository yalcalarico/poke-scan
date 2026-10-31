"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useVisualMotionPaused } from "@/components/visual-preview/visual-preview";
import type { CardDto } from "@/types/api";
import styles from "./home-screen.module.css";

export function HomeFan({ cards }: { cards: readonly CardDto[] }) {
  const paused = useVisualMotionPaused();
  return (
    <ul className={styles.fan} aria-label="Cartas destacadas" data-vineta-shelf data-count={Math.min(cards.length, 3)}>
      {cards.slice(0, 3).map((card, index) => (
        <li key={card.id} style={{
          "--fan-side": [-1, 1, 0][index],
          "--fan-angle": ["-12deg", "12deg", "0deg"][index],
          "--fan-rise": index === 2 ? "-12px" : "0px",
        } as CSSProperties}>
          <Link href={`/carta/${encodeURIComponent(card.id)}`} aria-label={`Ver ${card.name}`}>
            <div data-home-card-art className={styles.fanArt}
              style={{ animationPlayState: paused ? "paused" : "running" }}>
              <Image src={card.imageLarge || card.imageSmall} alt={`Carta ${card.name}`}
                width={252} height={352}
                sizes="(max-width: 700px) 132px, (max-width: 1023px) 128px, (max-width: 1100px) 140px, 172px" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
