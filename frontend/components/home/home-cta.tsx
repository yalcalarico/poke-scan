"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import styles from "./home-screen.module.css";

export function HomeCta() {
  const { isAuthenticated } = useAuth();
  return <div className={styles.actions}>
    <Link href="/escanear" className={buttonVariants({ variant: "primary" })}>Escanear carta</Link>
    <Link href="/colecciones" className={buttonVariants({ variant: "secondary" })}>Ver colecciones</Link>
    <Link href="/inicio/vitrina" className={buttonVariants({ variant: "secondary" })}>Personalizar vitrina</Link>
    {!isAuthenticated && <Link href="/login">Iniciá sesión</Link>}
  </div>;
}
