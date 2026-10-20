#!/usr/bin/env node
const timeoutMs = Number(process.env.GATE_TIMEOUT_MS ?? 180_000);
const intervalMs = Number(process.env.GATE_INTERVAL_MS ?? 5_000);
const endpoint = process.env.READY_URL ?? 'http://backend:3001/api/ready';
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 999_999 || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 60_000 || new URL(endpoint).protocol !== 'http:') throw new Error('Configuración de gate inválida.');
const deadline = performance.now() + timeoutMs;
let last = 'sin respuesta';
while (performance.now() < deadline) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(5_000, Math.max(1, deadline - performance.now())));
  try {
    const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
    const body = await response.json();
    const database = body?.detail?.database?.state;
    const scanner = body?.detail?.scanner?.state;
    // Nunca incluir campos arbitrarios del endpoint en los logs operativos.
    const safe = (state) => ['ready', 'disabled', 'initializing', 'unavailable', 'incompatible', 'degraded'].includes(state) ? state : 'unknown';
    last = `http=${response.status} database=${safe(database)} scanner=${safe(scanner)}`;
    if (performance.now() < deadline && response.status === 200 && body?.status === 'ready' && database === 'ready' && scanner === 'ready') {
      console.log('Gate de readiness aprobado.');
      process.exit(0);
    }
  } catch {
    last = 'backend todavía no responde';
  } finally {
    clearTimeout(timer);
  }
  const remaining = deadline - performance.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
}
console.error(`Gate de readiness agotó el plazo: ${last}`);
process.exit(1);
