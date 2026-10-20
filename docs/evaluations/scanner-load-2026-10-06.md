# Concurrencia controlada del escáner — 6 de octubre de 2026

## Política actual

Una consulta activa por instancia de API. El resto recibe 503 «motor ocupado»,
sin cola ni reintento automático. El límite es compartido por todos los usuarios
de esa instancia; no es uno por usuario. Más réplicas significan workers/índices
independientes y mayor consumo de memoria. No se modificó esta política.

## Herramienta reproducible

Tras `pnpm run check`, desde backend:

```sh
node --env-file-if-exists=.env scripts/scanner-load-smoke.mjs /tmp/cards-1200/IMG_4985.png /tmp/scanner-load-report.json 10
```

Hasta 50 rondas por cada ráfaga de 1, 2, 4 y 8 consultas. Service compilado y
worker DINOv2 reales, sin DB, HTTP, proveedor externo ni persistencia de fotos.
Verifica una admisión por ráfaga, rechazos 503, mismo proceso, ranking consistente,
listeners sin acumulación y consulta exitosa al final. Lee RSS mediante `ps`
al finalizar cada ráfaga; ese máximo observado no es el pico continuo.
El script cierra sólo su worker, no sobrescribe reportes y respeta 6 MiB.

Regresión agregada: ráfaga de ocho consultas admite una sin terminarla al
rechazar las otras; tras veinte consultas más se conserva el worker y el
número de listeners. No modifica producción ni introduce una cola.

## Corrida corta

[Reporte](scanner-load-2026-10-06.json): 10 rondas por nivel, 152 intentos en
total incluyendo arranque y consulta posterior; 42 éxitos y 110 rechazos.
Índice: 20.670 referencias. Una foto repetida, no una evaluación de precisión.

| Consultas por ráfaga | Admitidas | Ocupado | p50 éxito (ms) | p95 éxito (ms) |
|---|---:|---:|---:|---:|
| 1 | 10 | 0 | 106,5 | 112,9 |
| 2 | 10 | 10 | 106,0 | 108,8 |
| 4 | 10 | 30 | 107,1 | 115,1 |
| 8 | 10 | 70 | 105,3 | 107,7 |

Frío n=1: 1.768,5 ms. Caliente n=41: p50 106,4 / p95 112,9 / p99 115,1 ms.
Cada grupo procesó aproximadamente 9 consultas admitidas/s, contando el muestreo
RSS entre rondas. No es capacidad HTTP garantizada ni tráfico continuo real.
Los rechazos se presentan aparte: incluirlos como consultas rápidas exitosas
falsearía latencia y throughput del reconocimiento.

RSS del worker: inicial 296 MiB, final 356 MiB, máximo observado 366,5 MiB.
Hubo descensos entre rondas; esta muestra no demuestra fuga ni estabilidad a
largo plazo. Los procesos permanecieron únicos y los listeners estables.

## Alcance

Mismo equipo de desarrollo, foto fija y carga acotada. No demuestra múltiples
usuarios/dispositivos, redes móviles, varias réplicas ni estabilidad prolongada.
El protocolo amplio/calibración sigue pendiente de fotos. Las mediciones del
service no incluyen validación/auth HTTP, preparación cliente, DB de catálogo
ni red. Cualquier verificación HTTP posterior se informa separadamente.

## Corrida ampliada y HTTP

[Corrida de 50 rondas](scanner-load-extended-2026-10-06.json): **752 intentos,
202 procesados, 550 ocupados**. Caliente n=201: p50 107,0 / p95 112,5 /
p99 116,1 ms; un arranque frio de 1.712,4 ms. Un worker, sin acumulacion de
listeners ni cambios de ranking/snapshot. RSS inicial 286,7 MiB, final
364,5 MiB, maximo observado 396,1 MiB. Hay descensos y fluctuaciones entre
bloques; no prueba fuga ni ausencia de fuga en una ejecucion prolongada.

[HTTP autenticado](scanner-load-http-2026-10-06.json): sin sesion 401; rafaga
de dos: un 200 y un 503; rafaga de cuatro: un 200 y tres 503. Consulta posterior
200 caliente y mismo ranking. Las respuestas exitosas calientes observadas
fueron 133,3 / 160,9 / 189,9 ms; son tres casos, no percentiles de produccion.
La prueba HTTP leyo catalogo y uso login de desarrollo, sin guardar colecciones,
pedir precios ni enviar datos a un proveedor externo.

## Verificacion y estado

`pnpm run check` exit 0: lint, tipos, 315 backend, 7 scripts, 6 e2e y 347
frontend (**675 pruebas**) y ambos builds. Log local:
`/tmp/scanner-load-2026-10-06-check.log`. API y web restauradas en un unico
stack. Cambios locales, sin commit/push.

No hizo falta cambiar la politica de concurrencia para cumplir el limite
actual. No se implemento una cola ni escalado horizontal. Quedan abiertos
SIGINT/reanudacion del indexador, estabilidad prolongada y matriz de dispositivos.
