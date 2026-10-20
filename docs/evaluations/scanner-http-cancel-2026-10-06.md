# Cancelación HTTP y reintento — 6 de octubre de 2026

Resultado: tres ciclos de consulta activa → cierre HTTP → reintento →
reutilización caliente, todos correctos. No hizo falta cambiar la aplicación.

## Prueba reproducible

Desde backend, con dependencias, catálogo, modelo e índice locales disponibles
y el código compilado:

```sh
node --env-file-if-exists=.env scripts/scanner-http-cancel-smoke.mjs /tmp/cards-1200/IMG_4987.png /tmp/scanner-http-cancel-report.json
```

El script levanta un servidor Nest aislado en un puerto efímero de loopback.
Usa el controller, DTO, ValidationPipe, JwtAuthGuard, service y worker DINOv2
compilados, junto con Prisma contra el catálogo real. Genera un secreto/token
JWT efímero que no sale en el reporte. No importa AppModule ni arranca jobs;
no modifica cartas, colecciones, precios o fotos.

Después del arranque, pausa únicamente su propio worker con SIGSTOP. Envía la
consulta por HTTP y verifica que llegó al service; otra consulta devuelve 503
por ocupado. Luego AbortController cierra la conexión HTTP mientras la primera
consulta sigue activa. Se exige que el service libere su estado, termine el
worker cancelado y permita un reintento con un worker nuevo. Se repite tres veces.

## Evidencia

[Reporte JSON](scanner-http-cancel-2026-10-06.json):

- Sin token: HTTP 401.
- Tres cancelaciones observadas como AbortError en el cliente.
- Estado ocupado liberado en 10,7–10,9 ms observados con polling de 10 ms;
  salida del worker en 11,0–12,6 ms. No son percentiles de producción.
- Tres reintentos HTTP 200, worker nuevo y carga fría: 1,39–1,42 s.
- Tres consultas posteriores HTTP 200, worker reutilizado caliente:
  136–162 ms. Mismo ranking de ocho IDs en todos los éxitos.
- Cabecera no-store presente; listeners entre consultas estables:
  message=0, exit=1, error=1, disconnect=1.

Cancelar termina el worker: el reintento paga otra carga del modelo/índice.
La prueba confirma el comportamiento existente y su recuperación, sin prometer
un reintento caliente inmediatamente después de cancelar.

## Límites

No valida login ni refresh, AppModule/throttler, proxy, navegador, cámara,
offline o red de teléfono. SIGSTOP asegura una inferencia pendiente de forma
controlada; no reproduce una caída de red física. No evalúa precisión del ranking.
Las pruebas de dispositivos y el corpus nuevo siguen abiertos en el roadmap.

Verificación final: `pnpm run stop` → `pnpm run check` verde con 675 pruebas
(315 backend, 7 scripts, 6 e2e, 347 frontend), lint, tipos y ambos builds.
`git diff --check` sin errores. API y web restauradas al terminar.
