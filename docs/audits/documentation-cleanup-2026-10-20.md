# Limpieza documental — 20/10/2026

**Completada como cambio exclusivamente documental.** Entradas actuales:
[índice](../README.md) y [estado del proyecto](../estado-actual.md).
La [auditoría previa](documentation-review-2026-10-20.md) y su inventario quedan
como snapshot de lo que motivó esta limpieza, no como estado posterior.

## Cambios aplicados

- Corregidos AGENTS, README raíz/frontend/backend y guías de arquitectura,
  decisiones, fuentes, API, jobs, providers, módulos, base de datos, rutas,
  componentes y escáner. Se contrastaron con servicios, controllers, schema,
  migraciones y manifiestos actuales; no se tocaron versiones ni producto.
- Separados catálogo y proveedores de precios; documentados ciclos diarios por
  sets habilitados, scope/prioridades, gate PostgreSQL, comparación TCGCSV y
  reglas 24 h/build. Retiradas instrucciones de backfill horario, cuotas globales
  antiguas y reconexión Redis por reinicio.
- Corregidos sesión en memoria/cookie HttpOnly, V2 predeterminada, estado actual
  DINOv2 sin ORB/OCR e inventarios de modelos/migraciones. Scrydex queda como
  alternativa sin implementación; sin cifras comerciales presentadas como actuales.
- Nueve planes/diseños [archivados en sus rutas originales](../archive/README.md),
  con aviso/reemplazo y cuerpos anteriores intactos: preserva relativos y anchors.
  Sus instrucciones antiguas quedan explícitamente fuera de vigencia.
- Seis registros centrales consolidados: estado único, registro de 38 IDs,
  checklist y contratos de dominio. Pasan de **482.037 a 29.708 bytes** de lectura
  activa (aprox. **94 % menos** en esos seis archivos). Esto mide lectura activa,
  no espacio total de Git: la historia no fue borrada.
- Ocho [snapshots completos exactos](../archive/orchestration-2026-10-20/README.md)
  preservan los seis registros, el prompt mini PC y roadmap anteriores, con
  SHA-256/ruta original. Su formato `.md.txt` evita confundirlos con guías actuales.
- Mini PC actualizada al esquema de precios del 20/10: preparación completa,
  ejecución real al final. Se mantienen Resend, B2, dueño custodio, retención 30d
  y supresiones antes de restore; no se repitieron ni inventaron decisiones.
- Roadmap del escáner conserva corpus, calibración, duración y dispositivos
  abiertos. Enlaza corrección y contraste del 20/10 sin atribuir causa a la
  diferencia frente al 5/5 histórico. Beta y entregables humanos vigentes conservados.

## Verificación

[Recibo estructurado](documentation-cleanup-2026-10-20-validation.json).

- Todos los archivos versionados regulares se contrastaron por SHA-256 con el
  inicio de esta tarea. Las únicas diferencias son documentos Markdown.
- **1.264 anexos de evidencia intactos**, **8 snapshots completos exactos** y
  **9 cuerpos archivados intactos** comprobados por hash.
- **38 IDs únicos y 20 completados** conservados. No hay cierres nuevos por limpieza.
- Enlaces relativos y anchors comprobados: sin rutas ausentes en archivos nuevos
  o modificados, sin nuevas anclas rotas y sin regresiones de anclas entrantes.
  Los 198 candidatos a rutas ausentes de evidencias/informes previos siguen
  identificados; no se fabricaron helpers ni se alteraron snapshots para resolverlos.
- `git diff --check` verde. Revisión delegada sólo lectura de guías, estados y
  decisiones: sin hallazgos materiales. Dos encargos usados, sin subdelegación.

Sin suites/builds, navegador, DB/Redis, requests externos, cambios de runtime o
configuración de automatización. No se detuvo la instancia del usuario. No hubo
borrados, movimientos, commit ni push. Los enlaces externos no se revalidaron.
