# Viñeta: una sola aplicación

La dirección elegida es `design/vitrina-variantes/03-vitrina-comic.html`. Se adapta a componentes reales: no hay HTML de maqueta embebido, segunda aplicación ni selector de versión.

## Qué cambia

| Parte | Implementación |
|---|---|
| Tinta y tramas | CSS Module existente de la capa visual; bordes con `--text-primary`, superficies `--warning-soft`/`--info-soft`, radios y sombras del sistema |
| Inicio | Hero narrativo con cartas reales, [vitrina personal](showcase.md), resumen de portafolio y [objetivos](goals.md) |
| Colecciones | Listado y detalle reales conservados; objetivos accesibles en cada álbum |
| Cuenta | [Datos y clave](account-controls.md), con sesiones reales y sin billing ficticio |
| Accesibilidad | Temas claro/oscuro, foco visible, reduced-motion y forced-colors |

## Movimiento

`AppVisualsProvider` conserva una sola fuente de estado para pausa manual y preferencia del sistema. El botón «Pausar efectos» está en el chrome mobile y en la navegación desktop; no agrega un sexto destino. Con movimiento reducido del sistema, el control informa esa preferencia y no la anula.

La pausa también frena inclinación, FLIP y cifras animadas, no sólo CSS. Al pausar se muestra el contenido final: no se congela un título invisible a mitad de entrada. Pestaña oculta y cartas fuera del viewport conservan sus límites anteriores. No se modifica captura ni reconocimiento de cámara.

## Límites honestos

Los precios siguen siendo referencias locales TCGCSV; ninguna pantalla descarga proveedores. Falta de precio no equivale a cero. Los objetivos no inventan progreso. Las políticas y PRO sólo muestran su indisponibilidad real; no hay términos aceptados, planes o pagos simulados.

## Verificación

Antes de suites, detener runtime propio con `pnpm run stop` y serializar DB/Redis/builds. `pnpm run check` es el gate completo. Pruebas focales de pausa: `pnpm --dir frontend exec vitest run components/visual-preview/motion-control.test.tsx components/visual-preview/visual-preview.test.tsx components/visual-preview/effects.test.tsx components/visual-preview/holo-card.test.tsx`.

La validación de controles en jsdom no acredita layout, contraste renderizado, cámara física ni Safari. Navegador se verifica con el runner aislado documentado en [testing](testing.md), sin capturas ni trazas por defecto.
