import type { SVGProps } from "react";

const paths: Record<string, string> = {
  "/inicio": "M3 10 12 3l9 7v11h-6v-7H9v7H3z",
  "/buscar": "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  "/escanear": "M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M7 12h10",
  "/colecciones": "M5 3h14v18H5zM9 3v18M5 9h14M5 15h14",
  "/ajustes": "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
};

export function HomeNavIcon({ href, ...props }: SVGProps<SVGSVGElement> & { href: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={paths[href]} />
  </svg>;
}
