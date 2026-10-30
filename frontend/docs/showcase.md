# Vitrina de inicio

Inicio consulta la vitrina privada después del bootstrap autenticado; el invitado conserva el preview del catálogo real, claramente identificado. `/inicio/vitrina` permite elegir valor o selección personal, cargar cartas por colección/página y guardar preferencias en la API. Hay estados separados para carga, error, colección vacía y falta de referencias.

El pool manual persiste por cuenta; se muestran hasta tres cartas, sin duplicar IDs. Un turno local por usuario rota el pool al recargar y se mantiene durante renders/reintentos. Si sessionStorage no está disponible se conserva el primer turno; no se guardan cartas, precios ni credenciales en él. La preferencia real no depende de ese almacenamiento.

La referencia muestra variante y valor unitario, con origen TCGplayer vía TCGCSV. No es precio realizable ni valor ajustado por condición. Cambiar a modo valor limpia la selección enviada; los precios nulos no se convierten en cero.

Pruebas: `pnpm --dir frontend exec vitest run lib/api/showcase.test.ts components/home/personal-showcase.test.tsx components/home/showcase-rotation.test.ts`.
