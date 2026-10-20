import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';


const FAQ_ITEMS = [
  {
    id: 'que-es-pokescan',
    question: '¿Qué es PokéScan?',
    answer:
      'PokéScan es una app web para buscar cartas Pokémon, organizar colecciones y consultar referencias de mercado cuando hay datos disponibles. Podés revisar progreso por set, duplicadas, historial de referencias de cartas y observaciones del portafolio por consulta, exportar una colección a CSV y crear enlaces de solo lectura.',
  },
  {
    id: 'como-identifica',
    question: '¿Cómo funciona el escáner y qué pasa con mi foto?',
    answer:
      'El escáner usa reconocimiento visual DINOv2 y requiere cuenta y conexión. Podés subir una foto o usar la cámara en un teléfono compatible: se envía el recorte para procesarlo sin guardar la foto de consulta. La sugerencia puede ser incorrecta o no aparecer. Revisá y corregí la carta antes de guardarla.',
  },
  {
    id: 'offline',
    question: '¿PokéScan funciona sin conexión?',
    answer:
      'No. Para buscar en el catálogo, reconocer cartas, consultar o sincronizar tu colección necesitás conexión. Algunas páginas públicas visitadas pueden seguir visibles desde caché; eso no garantiza que estén actualizadas.',
  },
  {
    id: 'precios',
    question: '¿De dónde salen los precios?',
    answer:
      'Mostramos referencias internacionales del mercado indicado por la fuente para la variante cuando hay datos. La fecha de consulta indica cuándo PokéScan obtuvo la referencia; no confirma cuándo se actualizó el mercado. Si la fuente aporta su propia fecha, se muestra por separado; puede faltar o ser anterior. Si ves ARS, es una conversión al cambio actual elegido, no un precio realizable en Argentina. La condición que guardás no modifica el valor automáticamente. La referencia puede faltar o estar desactualizada; no es oferta de compra ni tasación.',
  },
  {
    id: 'ars',
    question: '¿Puedo ver los valores en pesos argentinos?',
    answer:
      'Sí. Podés ver USD o convertir la referencia a ARS usando la cotización blue u oficial que elijas. El cambio aplicado es el actual; el importe no acredita una operación en pesos ni representa una cotización de compraventa local.',
  },
  {
    id: 'cuenta',
    question: '¿Necesito una cuenta para empezar?',
    answer:
      'Podés explorar el catálogo sin cuenta. Necesitás una cuenta para reconocer cartas con DINOv2, guardarlas en colecciones, sincronizarlas y administrar tus enlaces compartidos. El reconocimiento requiere conexión y puede fallar; revisás la sugerencia antes de guardar.',
  },
  {
    id: 'planes',
    question: '¿Qué incluye Gratis y qué incluiría Pro?',
    answer:
      'Hoy no hay plan Pro activo ni pagos. El catálogo, el historial de cartas, las observaciones del portafolio por consulta y la exportación CSV básica están disponibles sin suscripción. Seguimiento automático y alertas no están disponibles; cualquier plan futuro depende de validar su utilidad, costos y condiciones. No hay precio ni fecha confirmados.',
  },
  {
    id: 'juegos',
    question: '¿Funciona con otros juegos de cartas?',
    answer:
      'Por ahora, PokéScan está enfocado en Pokémon TCG.',
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
