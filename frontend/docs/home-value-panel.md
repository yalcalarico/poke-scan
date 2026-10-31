# Home: valor de referencia

El panel de Home sigue la composición de la referencia: encabezado uppercase,
píldora de moneda a la derecha, valor positivo de 32 px, cobertura real,
advertencia interior y disclosure **Cómo se calcula**. No muestra datos de demo.

## Moneda y datos

- La píldora muestra la moneda actual. Su nombre accesible anuncia la acción
  **Cambiar a ARS** o **Cambiar a USD**. El área táctil es de al menos 44 × 44 px,
  aunque el badge visible sea compacto; admite foco y activación con teclado.
- Usa `useCurrency` y `Money`: no convierte ni persiste por su cuenta. Cambiar
  moneda no vuelve a consultar el portfolio. La preferencia y el tipo de cambio
  siguen siendo los del proveedor raíz, sin proveedores nuevos.
- Durante la carga de cotización, ARS está deshabilitado. Sin cotización, indica
  **ARS no disponible: no hay cotización.** y conserva USD. Una cotización
  anterior disponible sigue siendo utilizable y se indica al mostrar ARS.
- Un monto desconocido sigue siendo **—**, nunca cero, en ambas monedas.
- Las cantidades y cartas sin referencia vienen del portfolio. El panel mantiene
  la aclaración de valor parcial, la fuente TCGplayer vía TCGCSV y la advertencia
  de que una conversión a ARS no representa un precio de venta local.

## Sesión y navegación

Visitantes ven el mismo panel con guion y una invitación a guardar sus cartas,
sin consultar el portfolio privado. Durante bootstrap se conserva el mensaje
**Cargando tu colección…**, incluso si hay un usuario transitorio.

Con sesión se mantienen la carga de valoración, error y reintento mediante
`useAsync`. El disclosure explica la suma por variante y permite **Ver evolución**
en `/colecciones`; para visitantes ofrece **Ver colecciones** en la misma ruta.
La condición registrada no ajusta la referencia.

## Verificación

`components/home/home-value-panel.test.tsx` usa `CurrencyProvider` y `Money`
reales con las APIs existentes simuladas. Cubre cambio USD/ARS y persistencia,
guion, ARS ausente/cargando/anterior, visitante, bootstrap, cobertura completa y
parcial, disclosure, carga/error/reintento y enlace previo a colecciones.

La fidelidad visual, contraste en ambos temas y tamaño táctil computado requieren
la comparación de Home en navegador que realiza la integración. Los estilos son
locales: su especificidad evita que los encabezados y superficies del shell
alteren esta composición, sin cambiar el resto de Home.
