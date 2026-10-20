# Gráfica de comparación: escala y huecos

16/10/2026 Argentina. Pedido humano: gráfica con picos altos y bajos. La captura contiene dos observaciones separadas por días sin datos; no acredita trayectoria intermedia ni permite dibujar picos. Se conserva la regla de cortar null/días ausentes.

Cambio: eje vertical ajustado al rango observado con margen, tres referencias de precio y guías con tokens; aviso de escala, de huecos y de pocas observaciones. Aplica al componente compartido de cartas/colecciones/portfolio. No se cambia contrato, proveedor, datos, política de ingestión ni se inventa historia.

Verificación:5pruebas del componente verdes. Primer check falló en una prueba de calendario INF03: reloj simulado Date.now()+100 quedaba atrasado respecto al marker creado con reloj real cuando el setup tardaba más de100ms. Corrección exclusiva del fixture: sincronizar clockState al terminar las inicializaciones; guard originalTime de producción intacto.15pruebas de calendario verdes y nuevo pnpm run stop+pnpm run check exacto verde:1240pruebas,0skip,lint/tipos/buildsNestNextTurbopack. Logs de ambos intentos y recursos propios en /private/tmp/pokescan-chart-20261015; no repetir suites verdes.

Navegador real Articuno me55-132/Holofoil: ejeUSD5.24–6.08, precioUSD5.36, fechas13/10y16/10, aviso de huecos y pocas observaciones. Viewports390x844y1280x900 sin overflow horizontal, ejes visibles, período7d activable con Enter. Tema oscuro verificado; acceso a Ajustes anónimo redirige a login, tema claro no verificado en navegador. Sin capturas por preferencia vigente. Un selector inicial de figure con nombre equivocado fue corregido usando el nombre real del DOM; no fallo del producto.

Recursos QA: clon marcado y Redis privado retirados por marker/fullID/conexionesSQL0, inventario/test compartidos y5GIN conservados. App habitual reiniciada mediante pnpm run dev, sesión89050/API57835; readiness y workers retomados. No cierres nuevos de IDs. Pendiente: histórico real suficiente para una línea con picos; dos precios aislados permanecen como puntos.
