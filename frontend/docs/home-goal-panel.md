# Home: próximo objetivo

El panel sigue la referencia Viñeta: título, badge, colección, marca inclinada,
objetivo/sugerencia, acciones y nota inferior. El selector de colección se conserva
dentro del panel; no modifica el panel usado en el detalle de colecciones.

- Sin objetivos ofrece una sugerencia editorial, no un objetivo guardado ni DEMO.
  **Generar otra** cambia sólo el texto local y recorre las ideas existentes.
- **Usar sugerencia** abre el editor compartido con ese texto. Cancelar no guarda;
  **Guardar objetivo** usa el alta existente y recarga la colección.
- Un objetivo creado no se marca como próximo por inferencia. Si no hay próximo,
  el panel lo aclara y permite elegir desde **Ver objetivos**.
- Cuando existe un próximo, se muestra el real y **Editar objetivo** usa el editor
  existente. Cambiar de colección descarta el borrador de la anterior.
- Carga, error/reintento, visitante y ausencia de colecciones siguen explícitos.
  No se calcula progreso ni se inventan compras pendientes.

Las pruebas `home-goal-reference.test.tsx` recorren estas acciones por la interfaz
pública y verifican que generar, abrir y cancelar no emiten mutaciones.
