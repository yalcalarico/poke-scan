# Home Viñeta

Home sigue la composición de [Vitrina Viñeta](../../design/vitrina-variantes/03-vitrina-comic.html):
hero de dos paneles, abanico superpuesto, galería y compartir a la izquierda,
valor y objetivos a la derecha. En móvil se apilan, sin cambiar otras rutas.

## Datos y acciones

- La vitrina autenticada conserva selección, rotación y ranking reales.
- La galería muestra hasta cuatro cartas distintas de la colección predeterminada
  (o la primera disponible). No rellena espacios con cartas inventadas.
- Sin sesión se identifica expresamente el catálogo público; sin catálogo se
  conserva el acceso al escáner.
- Compartir abre Colecciones: ahí se elige la colección y se revisa su publicación.
  Home no crea enlaces ni cambia privacidad.
- Valores sin referencia, errores y objetivos vacíos siguen siendo estados reales.

## Movimiento

Las poses del abanico son independientes del balanceo de 4,8 s. Sólo se animan
transformaciones; no hay actualizaciones React por cuadro ni inclinación adicional
de la carta. Pausa, pestaña oculta y movimiento reducido conservan el contenido.
La entrada de 400 ms se limita al título, no a toda la pantalla de Home.

Los tamaños del abanico son 172 px en escritorio y 132 px en móvil, con separación
lateral de 108/72 px y centro elevado 12 px. Se preservan los cortes intermedios
del artboard. Los iconos de referencia se aplican sólo en `/inicio`.

## Verificación

`home-fidelity.test.tsx` cubre composición, poses, enlaces, pausa y navegación
fuera de Home. Las comparaciones de navegador usan datos sintéticos, sin inventario
real, capturas locales ignoradas y sin videos/traces. RAF mide intervalos de
callbacks: no demuestra FPS de render ni la causa de una lentitud percibida.
