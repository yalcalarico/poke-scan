# FE-03 — Implementación de cobertura y frescura de valuación

8/10/2026 · Luna · implementación frontend acotada. Revisión Sol HIGH y gate integrado pendientes.

## Resultado

La UI consume `valuation.amount` como cifra agregada y describe cobertura por copias del scope recibido. Distingue colección vacía, cero conocido, total sin referencia, subtotal parcial y metadata legacy ausente. La colección y el portafolio indican momento de evaluación, conteos/rango de consulta y frescura upstream, sin recalcularla con el reloj del browser. El resumen de portafolio y su lista histórica leen la valuación de cada snapshot y aclaran que la antigüedad histórica no está registrada.

La ficha conserva su hoja de variantes. El hero usa la primera fila con `market` conocido en orden canónico; `market: null` no se rescata con `mid`, y el delta y la fecha de consulta salen de esa misma fila. Cada variante expone proveedor, mercado, moneda original, consulta, evaluación y fecha de fuente. En el item de colección, selector y subtotal usan la variante exacta; al cambiar la variante, la hoja deja de asociar el precio previo y explica que la referencia de la nueva variante aparecerá después de guardar. La condición queda registrada y se aclara que no ajusta el valor.

El enlace público permanece en USD. Su resumen usa `stats.valuation` del scope completo y distingue copias cotizadas de grupos visibles; los datos de cada grupo conservan variante, condición y metadata permitida. El portafolio conserva su gráfico, rangos, lista accesible y máximo/orden de top cards. En superficies privadas ARS se explica que la referencia internacional usa la cotización vigente, con tipo y fecha cuando están disponibles.

## Archivos y preservación

Los cambios propios están delimitados en [own-reserved.diff](/private/tmp/fe03-luna-baseline-20261008/own-reserved.diff). La captura previa está en [base/](/private/tmp/fe03-luna-baseline-20261008/base), con hashes en [baseline-sha256-complete.txt](/private/tmp/fe03-luna-baseline-20261008/baseline-sha256-complete.txt) y el diff que ya existía en [preexisting.patch](/private/tmp/fe03-luna-baseline-20261008/preexisting.patch). El baseline incluye el estado local previo de los dos componentes públicos y la documentación de API que ya estaban modificados, además de los tests públicos preexistentes sin seguimiento. Los otros archivos reservados que estaban limpios se reconstruyeron desde HEAD. No se tocaron backend, DTO, schema, servicios, sesión, scanner, shell, proveedores, dependencias ni datos.

## Verificación ejecutada

- `pnpm run stop` antes de los tests; liberó los puertos 3000/3001.
- Suites frontend enfocadas: 7 archivos, **47 pruebas aprobadas** (`card-price-section`, `price-history`, `price-evidence`, `portfolio-overview`, `collection-card`, `public-card-grid`, `public-collection-view`).
- `pnpm --dir frontend run lint`: aprobado, incluidos los guardas de colores y URLs.
- `pnpm run typecheck`: aprobado.

Vitest mostró una advertencia no bloqueante sobre `configLoader: 'native'` y la sintaxis CommonJS/ESM de `vitest.config.ts`. No corrí `pnpm run check`, la suite frontend completa, build, base de datos ni servicios. La revisión visual en navegador, ambos temas/dispositivos, lector de pantalla y teclado real quedan para el gate/revisión Sol; las suites DOM no los acreditan. La validación de comprensión con participantes sigue pendiente según UX-03.

## Límites

Los campos legacy ausentes se presentan como desconocidos. `fetchedAt` se identifica como consulta, `evaluatedAt` como evaluación, y el upstream ausente sigue sin fecha disponible. No se agregaron requests, selectores, fuentes, refresh de proveedor ni afirmaciones de precio local realizable, ganancia o ROI. La reserva FE-03 queda lista para revisión Sol HIGH; no se cierra el ID ni el gate del lote.

## Revisión Sol HIGH · 8/10/2026

La revisión/corrección enfocada quedó registrada en [FE-03-review.md](FE-03-review.md) y [su evidencia](FE-03-review-evidencia.json): 78 pruebas en 9 archivos, lint/guardas y typecheck aprobados; build alternativo webpack aprobado, estándar Turbopack bloqueado por el entorno. Se corrigieron semántica del historial/público, instante UTC de evaluación, ausencia/unitario del item y trap de Sheet con extensión autorizada. Visual acotada con mocks en ambos temas y 390/1280; gate real API/web y `pnpm run check` estándar siguen pendientes. La captura recibida y diff de Sol separan sus correcciones del baseline local y de la implementación Luna; no se cierra el ID.
