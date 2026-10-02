import type { IdentifiedCandidateDto } from '@/types/api';

export type ScanStatus = 'confident' | 'ambiguous' | 'low';

/** Los scores sirven para ordenar; la certeza requiere señales de impresión. */
export function assessCandidates(candidates: readonly Pick<IdentifiedCandidateDto, 'score' | 'rawScore' | 'signals'>[]): ScanStatus {
  const top = candidates[0];
  if (!top || top.score < 0.55) return 'low';
  const next = candidates[1];
  const margin = next ? top.rawScore - next.rawScore : top.rawScore;
  const corroborated = top.signals.printedNumber === true ||
    (top.signals.setCode === true && top.signals.numberHint === true);
  const contradicted = top.signals.printedNumber === false || top.signals.setCode === false;
  return top.score >= 0.85 && margin >= 0.08 && corroborated && !contradicted
    ? 'confident' : 'ambiguous';
}
