# Cuaderno local de beta

Abrí `evaluacion.html` en un navegador. Es un HTML autónomo: no requiere instalar dependencias ni conectarse a PokéScan. Podés usarlo en la computadora o copiarlo al dispositivo de la sesión. No tiene envíos, analytics, almacenamiento automático, fotos, grabación ni capturas. La app del estudio se usa por separado.

Seis etapas: preparar/consentir, entrevista neutral, lote comparado de20copias, explicación espontánea del precio, feedback y seguimiento D28. Reutiliza RES-01-segmento, RES-03-protocolo, UX-03-valores y DEC-04 de `docs/plans/lanzamiento-2026-10-07/RESULTADOS/`. No reemplaza el corpus/ground truth/holdout de RES-02 ni afirma resultados del estudio.

1. Primero probá el modo **Preparación** sólo con datos ficticios. No cuenta como evidencia real.
2. Antes de recolectar notas de una persona, el responsable acuerda acceso, fecha de borrado y canal de retiro. Elegí **Sesión real consentida**, código seudónimo y consentimiento. No usar nombres/contactos/secretos/enlaces privados. No se presupone aprobada la retención propuesta en los protocolos.
3. Las preguntas son opcionales. Seguí la pauta y registrá ayuda, abandono, incertidumbre y faltantes. Antes de codificar comprensión, guardá la explicación inicial; no enseñar la rúbrica. Una candidata de cámara no cuenta como copia persistida.
4. Exportá **JSON** para retomar y **CSV** para consolidar. Ambos conservan respuestas vacías; no convertidas a cero. Guardalos fuera de Git, en el almacenamiento privado acordado. **Recargar/cerrar la pestaña pierde las notas no exportadas.** No hay localStorage ni backend.
5. D28 usa UTC `[activación+28d, activación+35d)`, madurez sólo al corte de35d; separa autorreporte/observación y retorno provocado/espontáneo. Una sesión no demuestra tasas agregadas ni los objetivos8/10,9/10 o25%.

Retirar consentimiento borra las notas de esta pestaña. Los archivos exportados deben retirarse por separado por el responsable; el navegador no puede borrarlos por su cuenta. El archivo no inicia invitaciones, contactos, seguimiento ni una recolección real automáticamente.

Las pruebas usan datos sintéticos, perfiles de navegador temporales y ninguna captura, trace o video. La implementación no modifica las rutas, DB, Redis ni contratos del producto.
