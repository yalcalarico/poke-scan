'use client';

import { cn } from '@/lib/cn';

export interface MatchedTextProps {
  /** El fragmento crudo del OCR que matcheó con esta carta. */
  text: string;
  /** El nombre de la carta, para resaltarlo dentro del fragmento. */
  cardName: string;
  className?: string;
}

const NON_ALPHANUMERIC = /[^a-z0-9]/i;

/**
 * Busca `needle` en `haystack` ignorando mayúsculas, espacios y signos, y
 * devuelve los índices en la cadena **original**.
 *
 * Hace falta porque el texto es OCR: "Gengar ex" llega como "Gengar eX",
 * "Charizard" como "Charizord" con ligadura, "Mr. Mime" como "Mr Mime". Una
 * comparación literal no encuentra nada y el resaltado —que es el motivo de
 * mostrar el campo— no aparece nunca.
 */
function findLoose(haystack: string, needle: string): { start: number; end: number } | null {
  const normalizedNeedle = needle.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalizedNeedle.length < 3) return null;

  // Se aplana el texto a [a-z0-9] y se guarda, para cada carácter plano, el
  // índice del original: eso es lo que permite volver a dibujar el resaltado
  // sobre la cadena que el usuario ve.
  const flat: string[] = [];
  const origin: number[] = [];
  for (let i = 0; i < haystack.length; i += 1) {
    const char = haystack[i];
    if (NON_ALPHANUMERIC.test(char)) continue;
    flat.push(char.toLowerCase());
    origin.push(i);
  }

  const from = flat.join('').indexOf(normalizedNeedle);
  if (from === -1) return null;

  const start = origin[from];
  const last = from + normalizedNeedle.length - 1;
  const end = (origin[last] ?? haystack.length - 1) + 1;
  return { start, end };
}

/**
 * ─── Por qué esto está en pantalla ───
 *
 * `IdentifiedCandidateDto.matchedText` estaba en el contrato desde el primer
 * día y **nunca se usó**. Es el fragmento del OCR que el backend usó para
 *_EMPEAREAR_ esta carta con este texto, y es la única pieza que explica por
 * qué la app cree que es esta carta: sin ella, un match de 0,62 es un número
 * que el usuario no puede discutir, y lo único que le queda es volver a
 * tomar la foto. Con ella, el usuario ve "leí esto" y puede confirmar o
 * corregir.
 */
export function MatchedText({ text, cardName, className }: MatchedTextProps) {
  const fragment = text.trim();
  if (!fragment) return null;

  const match = findLoose(fragment, cardName);

  return (
    <p className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-overline text-tertiary">Leímos</span>
      <span className="font-mono text-caption text-secondary break-words">
        {match ? (
          <>
            «{fragment.slice(0, match.start)}
            <mark className="bg-positive-soft text-positive">
              {fragment.slice(match.start, match.end)}
            </mark>
            {fragment.slice(match.end)}»
          </>
        ) : (
          <>«{fragment}»</>
        )}
      </span>
    </p>
  );
}
