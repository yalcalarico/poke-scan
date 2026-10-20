# Snapshot previo a la corrección de seguridad del proxy QA

El [manifiesto](manifest.json) conserva el hash y la ruta histórica del
[proxy original](control-proxy.mjs.txt). Sus bytes son idénticos al helper que
CodeQL señaló en el PR #7. Es evidencia histórica, no código para ejecutar.

La ruta original `RESULTADOS/SEO-01-runtime-anexos/harness/control-proxy.mjs`
ahora carga la [implementación mantenida](../../../scripts/qa/control-proxy.mjs),
con destino HTTP loopback fijo y path separado. El hash antiguo en los recibos
se refiere al snapshot de esta carpeta, **no** a la entrada corregida.
No se reescriben los recibos ni se oculta/desactiva el análisis CodeQL.

[Validación de la corrección](../../evaluations/pr7-ci-fix-2026-10-20.md).
