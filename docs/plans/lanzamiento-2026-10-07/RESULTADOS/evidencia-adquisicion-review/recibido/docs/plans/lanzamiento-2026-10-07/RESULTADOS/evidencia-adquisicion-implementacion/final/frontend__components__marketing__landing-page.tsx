import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Database,
  Layers,
  ScanLine,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import { AppPreview, fetchPreviewCards } from '@/components/home';
import { Badge, Surface, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';

import { FaqSection } from './faq-section';

const PRODUCT_POINTS = [
  {
    icon: ScanLine,
    number: '01',
    title: 'Buscá por nombre, número o artista.',
    body: 'Encontrá cartas y filtrá el catálogo por set.',
  },
  {
    icon: Layers,
    number: '02',
    title: 'Organizá tu colección.',
    body: 'Registrá cartas, separá duplicadas y marcá las que querés intercambiar.',
  },
  {
    icon: TrendingUp,
    number: '03',
    title: 'Consultá referencias con contexto.',
    body: 'Cuando hay datos, mirá la variante, la fuente y cuándo se consultó. Podés ver USD o su conversión a ARS.',
  },
] as const;

const FREE_FEATURES = [
  'Catálogo y búsqueda por nombre, número o artista',
  'Reconocimiento visual experimental con revisión antes de guardar (requiere cuenta, foto o cámara compatible y conexión; puede no identificar la carta)',
  'Colecciones, duplicadas y marcas para intercambio',
  'Progreso por set',
  'Referencias e historial de cartas cuando hay datos',
  'Observaciones del portafolio al consultar el resumen: incluyen cambios de cantidad y referencias',
  'Exportación CSV de una colección',
  'Conversión de referencias a ARS',
] as const;

export async function LandingPage() {
  const previewCards = await fetchPreviewCards();

  return (
    <main>
      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:px-8 lg:pb-20 lg:pt-20">
        <div className="flex flex-col items-start gap-6">
          <Badge tone="brand" className="rounded-pill px-3 py-1">
            Pokémon TCG · para organizar tu colección
          </Badge>

          <h1 className="max-w-2xl text-display text-primary">
            Tu colección Pokémon, ordenada carta por carta.
          </h1>

          <p className="max-w-xl text-body text-secondary sm:text-h3">
            Buscá cartas, organizá tus sets y tené a mano tus duplicadas. Cuando hay referencias
            disponibles, consultalas en USD o convertidas a ARS.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/buscar"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full px-6 sm:w-auto')}
            >
              Explorar el catálogo
              <ArrowRight aria-hidden="true" focusable="false" className="h-5 w-5" />
            </Link>
            <Link
              href="/escanear"
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full px-6 sm:w-auto')}
            >
              Probar el escáner
            </Link>
          </div>

          <p className="text-caption text-tertiary">
            Podés explorar el catálogo sin cuenta. Para escanear y guardar tu colección necesitás
            una cuenta y conexión.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div
            aria-hidden="true"
            className="absolute -inset-3 rounded-panel bg-brand-soft sm:-inset-5"
          />
          {previewCards.length > 0 ? (
            <div className="relative">
              <AppPreview cards={previewCards} />
              <Surface
                elevated
                className="absolute -bottom-4 left-3 flex items-center gap-3 sm:-bottom-5 sm:left-5"
              >
                <span className="grid size-10 place-items-center rounded-control bg-positive-soft text-positive">
                  <TrendingUp aria-hidden="true" focusable="false" className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-caption text-tertiary">Tu colección, más ordenada</span>
                  <span className="block text-label text-primary">Cartas · sets · duplicadas</span>
                </span>
              </Surface>
            </div>
          ) : (
            <Surface elevated className="relative flex aspect-[4/3] flex-col justify-between p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <Badge tone="brand">Pokémon TCG</Badge>
                <Database aria-hidden="true" focusable="false" className="h-5 w-5 text-tertiary" />
              </div>
              <p className="max-w-sm text-h1 text-primary">Buscá. Revisá. Coleccioná.</p>
              <p className="text-body text-secondary">Tu primer binder empieza con una carta.</p>
            </Surface>
          )}
        </div>
      </section>

      <section aria-label="Datos del catálogo" className="border-y border-line-subtle bg-surface">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-4 lg:px-8">
          <ProofPoint value="Pokémon TCG" label="Catálogo" />
          <ProofPoint value="Por set" label="Progreso y duplicadas" />
          <ProofPoint value="DINOv2" label="Reconocimiento visual experimental" />
          <ProofPoint value="USD + ARS" label="Referencia y conversión" />
        </div>
      </section>

      <section id="producto" className="scroll-mt-24 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-3 md:max-w-2xl">
          <p className="text-overline text-brand">DE LA MESA AL BINDER</p>
          <h2 className="text-h1 text-primary">Menos búsqueda. Más hobby.</h2>
          <p className="text-body text-secondary">
            PokéScan te ayuda a pasar de una pila de cartas a una colección que podés consultar,
            completar y compartir.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PRODUCT_POINTS.map(({ icon: Icon, number, title, body }) => (
            <Surface key={number} className="flex h-full flex-col gap-5 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-surface bg-brand-soft text-brand">
                  <Icon aria-hidden="true" focusable="false" className="h-6 w-6" />
                </span>
                <span className="font-mono text-caption text-tertiary">{number}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <h3 className="text-h3 text-primary">{title}</h3>
                <p className="text-body text-secondary">{body}</p>
              </div>
            </Surface>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <Surface className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-6 sm:p-7">
          <span className="grid size-12 place-items-center rounded-surface bg-positive-soft text-positive">
            <ShieldCheck aria-hidden="true" focusable="false" className="h-6 w-6" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="text-h3 text-primary">Tu captura se procesa para reconocer la carta.</h2>
            <p className="max-w-3xl text-body text-secondary">
              Para reconocer necesitás una cuenta y conexión. PokéScan envía el recorte para procesarlo
              con DINOv2, sin guardar la foto de consulta. Podés subir una foto; la cámara se ofrece en
              teléfonos compatibles. La sugerencia puede fallar: revisá y corregí la carta antes de
              guardar. Buscar, consultar referencias y sincronizar también requiere conexión.
            </p>
          </div>
        </Surface>
      </section>

      <section className="bg-surface-2">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16 lg:px-8">
          <div className="flex flex-col gap-4">
            <p className="text-overline text-brand">REFERENCIAS DE MERCADO</p>
            <h2 className="text-h1 text-primary">Una referencia internacional, también en ARS.</h2>
            <p className="text-body text-secondary">
              Consultá la referencia disponible de la variante y, si querés, mirala convertida al tipo
              de cambio blue u oficial elegido. La conversión usa el cambio actual; no representa un
              precio de venta en Argentina.
            </p>
            <p className="text-caption text-tertiary">
              La fecha indica cuándo se consultó el dato. No siempre conocemos cuándo se actualizó la
              fuente. La condición que registrás no ajusta automáticamente el importe.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CurrencyCard label="Referencia internacional" value="USD" detail="Cuando hay datos para la variante" />
            <CurrencyCard label="Conversión estimada" value="ARS" detail="Al cambio actual blue u oficial" />
            <CurrencyCard label="Progreso por set" value="Por set" detail="Faltantes y duplicadas" />
            <CurrencyCard label="Enlace de solo lectura" value="Un link" detail="Elegís qué colección compartir" />
          </div>
        </div>
      </section>

      <section id="planes" className="scroll-mt-24 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-3 md:max-w-2xl">
          <p className="text-overline text-brand">PLANES</p>
          <h2 className="text-h1 text-primary">Empezá gratis. Pro está en evaluación.</h2>
          <p className="text-body text-secondary">
            Hoy no hay suscripciones ni pagos activos. Cualquier propuesta de Pro dependerá de
            validar utilidad, costos y condiciones.
          </p>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Surface className="flex h-full flex-col gap-6 p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-h2 text-primary">Gratis</h3>
                <p className="text-body text-secondary">Funciones disponibles sin suscripción hoy.</p>
              </div>
              <Badge tone="positive">Disponible</Badge>
            </div>
            <p className="text-display text-primary">$0</p>
            <ul className="flex flex-1 flex-col gap-3">
              {FREE_FEATURES.map((feature) => (
                <PlanFeature key={feature}>{feature}</PlanFeature>
              ))}
            </ul>
            <Link
              href="/escanear"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}
            >
              Probar PokéScan
              <ArrowRight aria-hidden="true" focusable="false" className="h-5 w-5" />
            </Link>
          </Surface>

          <Surface elevated className="relative flex h-full flex-col gap-6 overflow-hidden border border-brand p-5 sm:p-7">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-brand" />
            <div className="flex items-start justify-between gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <h3 className="text-h2 text-primary">Pro</h3>
                <p className="text-body text-secondary">Una posibilidad en evaluación.</p>
              </div>
              <Badge tone="brand">En evaluación</Badge>
            </div>
            <p className="flex-1 text-body text-secondary">
              Todavía no hay un plan Pro activo, precio, cuotas ni fecha de lanzamiento. Estamos
              investigando qué herramientas serían útiles. El historial de cartas, las observaciones
              del portafolio por consulta y la exportación CSV básica ya están disponibles sin
              suscripción. No hay seguimiento automático de precios ni alertas.
            </p>
            <Link
              href="/faq#faq-planes"
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
            >
              Ver qué estamos investigando
            </Link>
            <p className="text-caption text-tertiary">
              Cualquier oferta futura dependerá de validar utilidad, costos y condiciones.
            </p>
          </Surface>
        </div>
      </section>

      <section className="border-y border-line-subtle bg-brand-soft">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-h2 text-primary">Empezá por encontrar una carta.</h2>
            <p className="text-body text-secondary">
              Explorá el catálogo o probá el reconocimiento visual con una captura. Revisá la
              sugerencia antes de guardarla.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/buscar" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}>
              Explorar el catálogo
            </Link>
            <Link href="/escanear" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-5')}>
              Probar reconocimiento visual
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <FaqSection />
      </div>
    </main>
  );
}

function ProofPoint({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-h-24 flex-col justify-center gap-1 px-3 py-4 sm:px-6">
      <span className="text-h3 text-primary">{value}</span>
      <span className="text-caption text-tertiary">{label}</span>
    </div>
  );
}

function CurrencyCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Surface className="flex min-h-32 flex-col justify-between gap-3 p-4 sm:p-5">
      <span className="text-caption text-tertiary">{label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className="text-h2 text-primary">{value}</span>
        <span className="text-right text-caption text-secondary">{detail}</span>
      </span>
    </Surface>
  );
}

function PlanFeature({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-3 text-body text-secondary">
      <Check aria-hidden="true" focusable="false" className="mt-0.5 h-5 w-5 shrink-0 text-positive" />
      <span>{children}</span>
    </li>
  );
}
