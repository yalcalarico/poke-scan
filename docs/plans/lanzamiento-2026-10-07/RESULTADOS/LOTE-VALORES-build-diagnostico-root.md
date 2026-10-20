# Diagnóstico final del build estándar

8/10/2026 · Coordinación Sol HIGH. El comando directo `pnpm --dir frontend run build`, con escalación aceptada, volvió a fallar con `EPERM` al abrir el puerto interno del proceso CSS de Turbopack. No hubo rechazo de auto-review. Esto descarta que el runner temporal sea la única causa; la limitación sigue sin resolver.

Después del diagnóstico se reconstruyó el output local mediante `pnpm --dir frontend run build --webpack`, exit 0, para dejar un build utilizable. No se cambiaron configuración, dependencias ni código de producto. Los 430 hashes de fuente siguen coincidiendo. No se repitieron suites globales ni se crearon servicios o datos.

Los 510 hashes runtime del gate anterior fueron verificados antes de este diagnóstico y conservan evidencia histórica del runtime que se probó. El diagnóstico y la reconstrucción reemplazaron `.next`; ese manifiesto no describe el output final reconstruido. La reconstrucción alternativa no convierte el check estándar fallido en aprobado. El gate y los IDs BE-04/FE-03 permanecen abiertos.

[Recibo y hashes de logs](LOTE-VALORES-build-diagnostico-root.json). Para cerrar falta resolver el build estándar y obtener el check requerido en verde; no repetir ensayos aprobados sin cambios o una causa nueva.
