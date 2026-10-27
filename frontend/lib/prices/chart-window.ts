export interface ChartDateRange {
  start: string;
  end: string;
}

/** La ventana elegida no se achica cuando faltan observaciones históricas. */
export function chartDateRange(days: number, evaluatedAt: string): ChartDateRange {
  const end = evaluatedAt.slice(0, 10);
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { start: start.toISOString().slice(0, 10), end };
}
