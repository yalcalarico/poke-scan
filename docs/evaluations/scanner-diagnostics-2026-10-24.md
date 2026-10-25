# Diagnóstico voluntario del escáner — 24/10/2026

## Estado del lote

Implementación de modelo/informe e integración frontend realizada. El usuario
autorizó continuar la revisión el 25/10 y dejó la prueba manual para el final.
**Revisión, correcciones y gate global aprobados; pendiente prueba final del flujo.**
Se mantiene el corte de aprobación al finalizar cada etapa. No se ejecutó el gate
global ni se acredita cierre del lote.

## Comportamiento implementado

- Diagnóstico voluntario, sólo en memoria, con set esperado opcional como contexto.
- Recorte exacto y respuesta original vinculados con revisión, selección manual,
  confirmación, descarte y guardado de cada lectura.
- Informe HTML autocontenido con JSON, ranking y cronología. No equivale a una
  medición de exactitud independiente ni restringe DINOv2 a un set.
- Límite de 30 lecturas o 64 MiB de recortes codificados; no bloquea el escáner.
- Sin cambios de backend, esquema, contratos HTTP ni almacenamiento persistente
  de imágenes o eventos. Las colecciones de la prueba anterior se conservan.

## Validación de esta etapa

- `pnpm run stop` antes de las pruebas.
- Cinco archivos focales, **37 pruebas aprobadas**: modelo, informe, galería,
  cámara y organización. La integración ejercita captura, elección manual,
  guardado y contenido del informe mediante mocks del reconocimiento y guardado.
- `pnpm run typecheck`: aprobado.
- `pnpm --dir frontend run lint`: aprobado; un warning existente de `img` en
  `components/cards/__tests__/card-tilt.test.tsx`, sin errores.
- Se corrigió el incremento del `runId` en el montaje inicial, detectado por
  regresiones de cámara/galería, y una aserción inválida sobre storage vacío.
- En el arranque se detectó y corrigió la resolución de un import del informe:
  usa el alias existente del frontend. Las nueve pruebas afectadas volvieron a
  pasar. `/escanear` y `/api/health` respondieron HTTP 200 por HTTPS LAN.
- App reanudada con `pnpm run dev:lan` en Herdr `w2:p7`, disponible en
  `https://192.168.1.41:3000/escanear` para revisión de esta etapa.
- No se acredita aún descarga física en Safari/PWA ni flujo real con cámara.

## Delegación y siguiente etapa

Cuatro encargos GPT-6 Luna consumidos, secuenciales y sin subdelegación: núcleo de
diagnóstico/informe, integración, reviewer de sólo lectura y corrección aprobada
por el usuario. Root conserva documentación y validación. Se alcanzó el máximo
de cuatro; las correcciones adicionales, si se justifican con evidencia nueva,
las resuelve root dentro de los límites vigentes. No iniciar la siguiente etapa
sin aprobación del usuario.

## Revisión — 25/10/2026

- **P2, reviewer:** desde el acceso «Ver opciones» de la cámara se puede finalizar
  mientras una captura sigue procesándose. El informe queda congelado antes de
  recibir la predicción de esa lectura. La corrección debe impedir finalizar con
  trabajo pendiente o representar explícitamente el cierre de ese trabajo.
- **P2, root:** el informe muestra el nombre del set esperado, pero no señala qué
  propuestas o elecciones están fuera de ese set, como establece el plan.
- **P2, root:** la confirmación manual deja el puesto en `null` aunque la carta
  elegida esté en el ranking original. Falta derivar y mostrar su puesto o su
  ausencia explícita, sin atribuirle una similitud nueva a la búsqueda manual.

La revisión no modificó código ni ejecutó suites o runtime. La siguiente etapa
propuesta es corregir estos puntos y agregar regresiones focales. El check global
y la prueba manual permanecen posteriores; no se pidió probar ahora la UI.

## Correcciones y validación focal — 25/10/2026

- Finalizar exige que terminen preparación, reconocimiento/precios y confirmación
  de alternativas. El núcleo rechaza además lecturas sin respuesta ni error.
- El informe clasifica propuesta y elección final dentro/fuera/desconocido respecto
  del set esperado y muestra el puesto original de la elección manual o su ausencia.
- Root completó la regresión de opciones de cámara con reconocimiento y precios
  diferidos, la terminalización de respuestas canceladas aunque la promesa resuelva,
  y pruebas que ejecutan el renderizador del HTML para validar el texto visible.
- `pnpm run stop` antes de tests; seis archivos focales, **43 pruebas aprobadas**.
  `pnpm run typecheck` y lint frontend aprobados. Se conserva el warning existente
  de `img` en `card-tilt.test.tsx`, sin errores.
- No se ejecutó aún `pnpm run check` completo ni la prueba manual: el usuario exige
  aprobación por etapa y dejó la prueba manual para el final.

## Gate global — 25/10/2026

El usuario autorizó esta etapa con «go». Se detuvo el runtime mediante Herdr y
`pnpm run stop`. La primera ejecución dentro del sandbox falló por restricciones
de sockets locales (`listen EPERM 127.0.0.1`); no acredita una regresión del código.
Esa corrida terminó y se repitió el comando con los permisos necesarios.

`pnpm run check` completo terminó con **exit code 0**:

- Lint de ambos proyectos y typecheck aprobados, con warnings existentes.
- Backend: 537 pruebas en 56 archivos; e2e: seis pruebas en dos archivos.
- Frontend: 630 pruebas en 81 archivos, incluidas las nuevas regresiones.
- Scripts backend, monitor, backups, custodia y QA: 105 pruebas, cero fallos.
- Builds backend y frontend aprobados.

Log local: `/tmp/scanner-diagnostic-global-check-permitted.log`. Se volvió a
levantar `pnpm run dev:lan` en Herdr `w2:p7`. La siguiente etapa es la prueba final
del flujo y la UI; no se acredita aún cámara física ni descarga en Safari/PWA.
No dar el lote por terminado antes de esos controles.
