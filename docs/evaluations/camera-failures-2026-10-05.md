# Dos fallos reales de cámara — 5 de octubre de 2026

El usuario aportó dos recortes JPEG y sus diagnósticos exportados manualmente desde el teléfono. Ambos tienen `source: camera`, `error: null`, verificador disponible e índice no stale: el motor devolvió candidatos equivocados, no un error de conexión. Son ejemplos positivos difíciles; no negativos ni una medición de precisión general.

Se repitió embedding/ranking y ORB usando los bytes exactos aportados, modelo/metadata vigente y lector completo de 20.670 referencias, 175 carpetas. Se reprodujeron las mismas predicciones y similitudes de los diagnósticos originales. No se recortó otra vez la consulta ni se descargaron referencias. [Reporte con hashes, metadata y resultados](camera-failures-2026-10-05.json).

| Captura UTC | Carta observada | Predicción guardada/reproducida | Posición de referencia en DINOv2 | Geometría al comprobarla directamente |
|---|---|---|---:|---|
| 2026-10-04 22:05:44, corrida 11 | N’s Darmanitan; edición sin confirmar | Flaaffy `swshp-SWSH122` | `sv9-27`: 392; `me2pt5-33`: 777 | 53/60 y 51/54 inliers/matches, respectivamente |
| 2026-10-04 22:07:12, corrida 19 | Carkol ASC 119/217, `me2pt5-119` | Alolan Dugtrio `mcd19-11` | 143 | 41/44 inliers/matches, cobertura 50,4 % |

La carta correcta Carkol está en el índice, pero queda fuera de los 64 candidatos enviados a ORB. Las dos referencias N’s Darmanitan con dibujo compatible también quedan fuera. El recorte de Darmanitan no muestra número/set al pie: se solicitó esa etiqueta al usuario. Ambas referencias comparten dibujo corroborado; ORB no confirma edición. La referencia promo `svp-181` quedó 1367.ª y no corroboró geometría (6/11, cobertura 1,4 %).

Las primeras predicciones equivocadas tuvieron 0 inliers y `verified: false`. Los diagnósticos guardados informan 2,19 s de API para Darmanitan y 3,28 s para Carkol; no son latencias completas de cámara ni tasas sobre todas las capturas del usuario.

## Interpretación y siguiente experimento

La comparación directa agregó referencias conocidas **sólo para localizar el fallo**, sin modificar candidatos o resultados de producción. No demuestra que el motor las recupere solo ni constituye un arreglo. Estos dos casos muestran una limitación del top-64 y de la política vigente de sumar el primer candidato sin rechazo calibrado. No justificar un umbral de coseno a partir de 0,719/0,673 ni favorecer estos IDs.

Darmanitan está parcialmente cortada y desplazada, con fondo arriba; Carkol muestra la carta casi completa, con reflejo/bajo contraste. Son observaciones del recorte, no causas demostradas. No atribuir ambos fallos únicamente a falta de borde ni prometer resolverlos sólo con instrucciones de encuadre.

Próximo paso: sumar estos casos al registro de regresiones (Carkol con etiqueta exacta; Darmanitan pendiente de set/número), junto con fotos correctas y negativos. Comparar estrategias de recuperación y tamaño de candidatos sobre el conjunto, midiendo costo frío/caliente y manteniendo el timeout; aumentar top-64 indiscriminadamente puede encarecer ORB y no calibra rechazo. Evaluar aparte una política de pedir confirmación cuando no hay corroboración, sin confundir geometría con edición/acabado. No se modificaron motor, umbrales, aceptación ni índice por estos dos ejemplos.

La llegada de los dos pares JPG/JSON confirma exportación de revisión bajo demanda desde cámara en el dispositivo del usuario. No certifica todos los estados físicos de cámara, estabilidad de auto captura, PWA o todos los dispositivos; no se informó modelo/OS/navegador.
