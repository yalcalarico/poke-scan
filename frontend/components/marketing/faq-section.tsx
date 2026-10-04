import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';


const FAQ_ITEMS = [
  {
    id: 'que-es-pokescan',
    question: '¿Qué es PokéScan?',
    answer:
      'Es una app web instalable para identificar cartas Pokémon, organizarlas en colecciones y consultar estimaciones de mercado. Incluye búsqueda por nombre, número y artista, progreso por set y enlaces para compartir colecciones.',
  },
  {
    id: 'como-identifica',
    question: '¿Cómo funciona el escáner y qué pasa con mi foto?',
    answer:
      'DINOv2 compara el dibujo de la carta con el catálogo. Se envía el recorte de tu foto a la API para reconocerlo, sin guardar la imagen. La primera predicción se suma a la sesión; revisá la edición al organizarla porque puede equivocarse con reflejos o reimpresiones.',
  },
  {
    id: 'offline',
    question: '¿PokéScan funciona sin conexión?',
    answer:
      'Consultar el catálogo, identificar una carta con DINOv2, actualizar precios o sincronizar una colección requiere conexión. Algunos datos públicos que ya visitaste pueden estar disponibles desde la caché.',
  },
  {
    id: 'precios',
    question: '¿De dónde salen los precios?',
    answer:
      'PokéScan muestra valores de mercado disponibles para la variante de la carta; la fuente puede no tener precio para todos los casos y el dato puede estar desactualizado. Es una referencia para coleccionistas, no una oferta de compra ni una tasación garantizada.',
  },
  {
    id: 'ars',
    question: '¿Puedo ver los valores en pesos argentinos?',
    answer:
      'Sí. Podés elegir USD o ARS y seleccionar la cotización blue u oficial. La conversión es una estimación basada en el tipo de cambio elegido, que puede variar.',
  },
  {
    id: 'cuenta',
    question: '¿Necesito una cuenta para empezar?',
    answer:
      'Podés explorar el catálogo sin cuenta. Necesitás una cuenta para reconocer cartas con DINOv2, guardarlas en colecciones, sincronizarlas y administrar tus enlaces compartidos.',
  },
  {
    id: 'planes',
    question: '¿Qué incluye Gratis y qué incluiría Pro?',
    answer:
      'Hoy no hay pagos ni un plan Pro activo: las funciones disponibles están abiertas sin suscripción. Estamos evaluando para Pro herramientas avanzadas de colección, como evolución del valor de cartera, alertas de precio y exportación. No se te va a cobrar por estas funciones hasta que estén disponibles y se comuniquen sus condiciones.',
  },
  {
    id: 'juegos',
    question: '¿Funciona con otros juegos de cartas?',
    answer:
      'Por ahora el catálogo y el escáner están enfocados en Pokémon TCG.',
  },
] as const;

export function FaqSection({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-overline text-brand">PREGUNTAS FRECUENTES</p>
        <h2 id="faq-title" className="text-h1 text-primary">
          Lo importante, sin letra chica.
        </h2>
        <p className="max-w-2xl text-body text-secondary">
          Cómo funciona el escáner, qué significa el precio y qué está disponible hoy.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item) => (
          <details key={item.id} className="group overflow-hidden rounded-surface border border-line bg-surface shadow-sm">
            <summary
              id={`faq-${item.id}`}
              className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-left text-label text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--focus-ring)] sm:px-5"
            >
              <span>{item.question}</span>
              <ChevronDown
                aria-hidden="true"
                focusable="false"
                className="h-5 w-5 shrink-0 text-tertiary transition-transform duration-fast group-open:rotate-180"
              />
            </summary>
            <div className="border-t border-line-subtle px-4 py-4 sm:px-5">
              <p className="max-w-3xl text-body text-secondary">{item.answer}</p>
            </div>
          </details>
        ))}
      </div>

      {!fullPage ? (
        <Link
          href="/faq"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-control text-label text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
        >
          Ver todas las preguntas
          <ArrowRight aria-hidden="true" focusable="false" className="h-4 w-4" />
        </Link>
      ) : null}
    </section>
  );
}
