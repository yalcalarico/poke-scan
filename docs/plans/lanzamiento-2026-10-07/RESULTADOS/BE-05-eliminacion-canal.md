# BE-05 — Canal de eliminación elegido

Fecha: 11/10/2026. Responsable de decisión: dueño del proyecto. Evidencia: respuesta humana **«Desde Ajustes (recomendado)»** en este chat. Estado: **canal resuelto; implementación pendiente**.

El usuario eligió una acción de autoservicio desde **Ajustes**, con sesión propia, ingreso de la contraseña actual y confirmación explícita de eliminación irreversible. El flujo debe explicar la retirada de la cuenta, sus colecciones y enlaces compartidos. La solicitud ordinaria no requiere asignar a una persona para aprobar cada baja; la operación de backups/restore y soporte excepcional conservan responsabilidades propias pendientes.

La reautenticación está alineada con la recomendación de [OWASP para operaciones sensibles](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#require-re-authentication-for-sensitive-features), consultada el 11/10. Su aplicación a eliminación es una propuesta de seguridad del proyecto, no una afirmación de cumplimiento legal.

Se conservan los requisitos ya revisados en [NEG-03](NEG-03-cuenta-requisitos.md) y [contrato BE-05](BE-05-contrato-borrador.md): autoridad de la sesión propia, revocación y consistencia de sesiones/escrituras, retiro de datos personales y lectura pública, conservación del catálogo/globales y confirmación sólo del estado realmente alcanzado. No se eligieron nuevas rutas/DTOs ni plazos en este paso. La página Ajustes y el controlador auth inspeccionados todavía no implementan eliminación.

**Actualización posterior, 11/10:** [retención y protección de restore elegidas](INF-03-retencion-supresiones.md); máximo30d desde creación, registro separado y reapertura condicionada. Implementación y operación siguen pendientes. El próximo propuesto es baja y ensayo de restore con cuentas propias de prueba; preguntar antes de iniciar.

**Copias separadas (contexto al elegir canal):** no prometer borrado inmediato de backups ni retirar CSVs/capturas ya descargados por terceros. Retención, responsable operativo, destino y protección contra reactivar cuentas eliminadas al restaurar siguen pendientes. La retención publicada de Resend no fija la de backups del proyecto.

**Próximo paso propuesto:** decidir la retención de copias tras una eliminación y las condiciones de restore, antes de implementar esa protección. Consultar al usuario antes de iniciar ese paso. Cuenta/dominio/envíos Resend reales y mini PC siguen diferidos como ya indicó el dueño; no se vuelven a pedir esos datos ahora.

Entrega exclusivamente de decisión: sin cambios de producto, eliminación de cuentas, fixtures, suites, DB/Redis, runtime, deploy ni contacto a usuarios. Instancia local intacta; automatización PAUSED/dos horas. **19/38 completos,19 pendientes**; BE-05/NEG-03/INF-03 conservan sus gates propios.
