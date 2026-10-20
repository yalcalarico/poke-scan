# FE-02 — Integración del contrato público BE-01

Fecha: 2026-10-07 · Estado: integración frontend implementada y verificación enfocada en verde; entrega parcial de FE-02 para revisión de coordinación.

## Cambios

- La vista pública consume `PublicShareStatsDto`: separa grupos, copias, cartas únicas y grupos con duplicadas; declara cobertura por grupos; distingue valor desconocido (`—`), subtotal parcial y cero para scope vacío. Si la lista está truncada, muestra los grupos visibles frente al total y aclara que los agregados cubren toda la colección.
- Cada fila pública conserva su grupo, sin identidad de inventario. La grilla deja que `CardGrid` use su fallback `card.id-index`, y presenta variante/condición con los helpers canónicos, cantidad incluso cuando es 1, referencia de mercado por copia y proveedor/fuente con fecha. Market `0` se trata como dato conocido; ausencia se rotula “Sin referencia”.
- La página hace fetch con `cache: 'no-store'`; `React.cache()` queda solo para deduplicar la lectura entre página y metadata durante el render. La metadata usa cobertura y rotula correctamente el valor desconocido/parcial; mantiene `noindex,nofollow` también para enlaces no disponibles.
- El service worker no intercepta navegaciones `/share/`, así que no las persiste ni aplica el fallback offline. Durante `activate`, borra las entradas `/share/` antiguas de caches propios y conserva las demás entradas y caches ajenos.

## Verificación

Después de `pnpm run stop`:

- Pruebas enfocadas de share, metadata, parser y service worker: **5 archivos, 8 pruebas aprobadas**.
- `pnpm --dir frontend run lint`: aprobado; guard de colores y URLs sin errores.
- `pnpm --dir frontend exec tsc --noEmit`: aprobado.

La revisión visual en navegador y el smoke integrado API/web quedan para coordinación. Este documento no declara FE-02 completo ni certifica validación en dispositivos físicos.

## Revisión integrada y correcciones

La referencia muestra proveedor y mercado cuando difieren, con fecha y monto USD por copia. La ausencia se presenta como “Sin referencia”, sin monto ni tono positivo. El resumen aclara que se trata de referencias de mercado internacional por variante, sin ajuste por condición ni promesa de precio de venta. El botón que amplía el prefijo visible habla de grupos y se conserva la identidad local existente; dos grupos con carta/variante/condición idénticas se renderizan separados y sin colisiones de claves.

El parser público ahora exige el catálogo completo, proyecta una allowlist propia de carta/set y preserva nullable strings; no modifica los parsers genéricos. Valida conteos enteros no negativos, relaciones de cobertura y valor vacío/desconocido/cero conocido, USD y fechas válidas. Se corrigió únicamente el comentario de `PlainShell` que prometía lectura de shares offline; su UI y comportamiento no cambiaron.

Pruebas enfocadas posteriores: **5 archivos, 15 pruebas pasan**. Incluyen metadata desconocida/parcial/cero y genérica tras 404; fetch sin Data Cache, extras privados descartados, atributos y grupos repetidos, y SW que purga copias públicas de caches propios, conserva otras entradas/caches ajenos y no intercepta navegación/RSC de shares. Tras ajustar la fixture de metadata para que sus precios coincidan con la cobertura, sus **4 casos** volvieron a pasar. Lint y `tsc --noEmit` frontend pasan. Gate global, smoke con stack y revisión visual móvil/desktop/temas siguen a cargo de coordinación; ver [revisión del lote](LOTE-BACKEND-review.md).
