# Lote BE-02 / BE-01 — revisión integrada

Fecha: 2026-10-07 · Revisor: GPT-6.1 Sol HIGH.

Estado: **correcciones y verificaciones enfocadas terminadas; reserva liberada**. Gate global, smoke del stack y revisión visual quedan a cargo de coordinación. No se actualizó el registro de tareas ni se declara FE-02 completo.

## Hallazgos y cambios

1. **Parser público permisivo.** Delegar a `toCardDto()` permitía cartas incompletas y defaults ficticios; los stats admitían conteos negativos/fraccionarios y valor cero con grupos sin referencia. El parser público valida el contrato completo y proyecta carta/set propios, sin modificar parsers genéricos ni DTOs privados. Ignora extras privados; conserva nullable strings del catálogo; valida contadores, cobertura, USD y fechas. Cero de mercado cuenta como referencia conocida.
2. **Procedencia y copy.** Mostrar solo proveedor ocultaba el mercado; la rama sin market decía “Referencia: Sin referencia por copia” en tono positivo. Ahora muestra proveedor y mercado si difieren, fecha y USD por copia, o “Sin referencia” neutral. El resumen aclara mercado internacional, sin ajuste por condición y sin promesa de precio de venta. Usa “Grupos con duplicadas” y el botón amplía grupos. Se corrigió solo el comentario de `PlainShell` que prometía shares offline.
3. **Cobertura de regresiones.** La fixture anterior >500 solo tenía precios ausentes y el Redis doble no almacenaba entradas. Ahora hay 522 grupos individuales/523 globales, con todas las referencias fuera de la lista visible, cantidades distintas, market cero, dos grupos iguales entre colecciones y exclusión de otro dueño. Caché Map serializa JSON y permite comprobar legacy, hits reales, desactivación/revocación con DEL fallido, expiración exacta caliente y SET tardío almacenado. El reloj solo sustituye Date; el TTL se calcula al escribir y se omite SET si venció durante una petición ya iniciada.
4. **HTTP y frontend.** Controller/servicio reales con PostgreSQL test y servidor efímero comprueban no-store en 200/404, privacidad serializada y respuesta genérica tras revocar con caché caliente. Frontend prueba shape público, invariantes, dos grupos iguales sin warning React, referencia/desconocido, metadata parcial/cero/404 y exclusión/purga SW, preservando entradas ajenas.

La revisión estática adicional de BE-02 no encontró una nueva regresión concreta en upsert atómico, replay, tombstones u ownership. No se modificó BE-02. La implementación BE-01 de elegibilidad DB previa a Redis, namespace public-v2 y TTL se conserva; la petición ya iniciada antes de vencer/revocar puede finalizar y una petición nueva vuelve a comprobar DB.

## Verificación ejecutada

Después de `pnpm run stop`, de forma serial:

- `pnpm --dir backend exec vitest run src/modules/share/share.service.spec.ts --no-file-parallelism`: **21/21 pasan**, contra `pokemon_cards_test`. La ejecución inicial en sandbox falló por EPERM al abrir el puerto efímero y por acceso a PostgreSQL local; la ejecución con acceso local autorizado pasó.
- `pnpm --dir frontend exec vitest run lib/api/schema.share.test.ts components/share/__tests__/public-card-grid.test.tsx components/share/__tests__/public-collection-view.test.tsx components/share/__tests__/public-share-metadata.test.tsx lib/__tests__/service-worker-routing.test.ts --no-file-parallelism`: **5 archivos, 15/15 pasan**. Tras hacer la fixture de metadata semánticamente consistente, se repitió solo ese archivo: **4/4 pasan**.
- `pnpm --dir backend run lint`, `pnpm --dir backend run build`, `pnpm --dir frontend run lint`, `pnpm --dir frontend exec tsc --noEmit`: **pasan**. Se corrigió el único warning nuevo de sort numérico añadiendo comparación explícita.
- Diff whitespace de archivos de esta revisión: sin errores.

Los runners informan advertencias previas de configuración Vite/tsconfig-paths; no son fallas de estas pruebas y no se modificaron paquetes/configuraciones para ocultarlas. No se corrió check global desde este rol.

## Alcance y pendientes

Archivos corregidos: parser público/tests, controller público/comentario y spec share, grilla/resumen/metadata públicos/tests, prueba SW, comentario `PlainShell`, documentación backend de tests y reportes BE-01/FE-02/este informe. Se preservaron los cambios del consumidor FE-02 en SW y fetch no-store. No se tocaron scanner, Prisma, migraciones, paquetes, datos de desarrollo ni UI privada de compartir. No se hicieron resets, FLUSHDB ni solicitudes a proveedores reales.

Coordinación debe ejecutar el check global y smoke real API/web con sesiones reales, HTML/metadata sin datos privados, Redis legacy y caliente, referencias parciales/desconocidas/vacías, dos grupos iguales y nuevas consultas tras desactivar/revocar/vencer. La revisión visual en 390 px, desktop y ambos temas sigue pendiente. No se promete borrar páginas abiertas, capturas ni copias ya descargadas.

## Cierre posterior por coordinación

Coordinación completó check global/smoke/revisión visual con límites en [LOTE-BACKEND-validacion.md](LOTE-BACKEND-validacion.md). El diagnóstico read-only adicional Sol HIGH confirmó el comportamiento de streaming200 para notFound de Next y la necesidad de verificar HTML completo; no requirió cambios de aplicación. Reservas liberadas.
