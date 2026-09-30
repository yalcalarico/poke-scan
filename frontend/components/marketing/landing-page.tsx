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
    title: 'Identificá sin tipear todo',
    body: 'El OCR lee la carta y compara el texto con el catálogo. Revisás la candidata antes de guardarla.',
  },
  {
    icon: Layers,
    number: '02',
    title: 'Ordená tu binder a tu manera',
    body: 'Separá colecciones, controlá duplicadas y marcá cuáles querés intercambiar.',
  },
  {
    icon: TrendingUp,
    number: '03',
    title: 'Entendé el valor, con contexto',
    body: 'Consultá las cotizaciones disponibles, su variante y su actualización. Elegí USD o ARS.',
  },
] as const;

const FREE_FEATURES = [
  'Catálogo Pokémon y búsqueda por nombre, número o artista',
  'Escáner con confirmación antes de guardar',
  'Colecciones, duplicadas y marcas para intercambio',
  'Progreso por set y binder',
  'Precios e historial cuando hay datos disponibles',
  'Conversión a ARS: blue u oficial',
] as const;

const PRO_PREVIEW = [
  'Evolución del valor total de tus colecciones',
  'Alertas de precio para cartas que seguís',
  'Exportación y reportes de tus binders',
  'Más herramientas para organizar colecciones grandes',
] as const;

export async function LandingPage() {
  const previewCards = await fetchPreviewCards();

  return (
    <main>
      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:px-8 lg:pb-20 lg:pt-20">
        <div className="flex flex-col items-start gap-6">
          <Badge tone="brand" className="rounded-pill px-3 py-1">
            Pokémon TCG · hecha para coleccionistas de acá
          </Badge>

          <h1 className="max-w-2xl text-display text-primary">
            Tu colección, carta por carta. Y su valor, con contexto.
          </h1>

          <p className="max-w-xl text-body text-secondary sm:text-h3">
            Escaneá, organizá tus sets y consultá estimaciones de mercado en USD o pesos argentinos.
            Sin planillas y sin perder de vista tus duplicadas.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/escanear"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full px-6 sm:w-auto')}
            >
              Probar el escáner
              <ArrowRight aria-hidden="true" focusable="false" className="h-5 w-5" />
            </Link>
            <Link
              href="/buscar"
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full px-6 sm:w-auto')}
            >
              Explorar el catálogo
            </Link>
          </div>

          <p className="text-caption text-tertiary">
            El catálogo y las herramientas actuales están disponibles sin suscripción.
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
              <p className="max-w-sm text-h1 text-primary">Escaneá. Confirmá. Coleccioná.</p>
              <p className="text-body text-secondary">Tu primer binder empieza con una carta.</p>
            </Surface>
          )}
        </div>
      </section>

      <section aria-label="Datos del catálogo" className="border-y border-line-subtle bg-surface">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-4 lg:px-8">
          <ProofPoint value="20.670" label="cartas en el catálogo" />
          <ProofPoint value="176" label="sets para explorar" />
          <ProofPoint value="OCR local" label="la foto no se sube" />
          <ProofPoint value="USD + ARS" label="blue u oficial" />
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
            <h2 className="text-h3 text-primary">La foto no se sube.</h2>
            <p className="max-w-3xl text-body text-secondary">
              El OCR procesa la imagen en tu dispositivo. Para identificarla, PokéScan envía las líneas
              de texto reconocidas al catálogo; buscar, obtener precios y sincronizar tu cuenta requiere
              conexión.
            </p>
          </div>
        </Surface>
      </section>

      <section className="bg-surface-2">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16 lg:px-8">
          <div className="flex flex-col gap-4">
            <p className="text-overline text-brand">PENSADA PARA ACÁ</p>
            <h2 className="text-h1 text-primary">El valor también se entiende en pesos.</h2>
            <p className="text-body text-secondary">
              Consultá valores de mercado disponibles en USD y miralos convertidos a ARS con la
              cotización blue u oficial que elijas.
            </p>
            <p className="text-caption text-tertiary">
              Son estimaciones de referencia: dependen de la variante, la fuente y cuándo se actualizó.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CurrencyCard label="Moneda de referencia" value="USD" detail="Valor de mercado disponible" />
            <CurrencyCard label="Conversión local" value="ARS" detail="Elegí blue u oficial" />
            <CurrencyCard label="Tu binder" value="Por set" detail="Progreso, faltantes y duplicadas" />
            <CurrencyCard label="Para compartir" value="Un link" detail="Mostrá tu colección en solo lectura" />
          </div>
        </div>
      </section>

      <section id="planes" className="scroll-mt-24 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-3 md:max-w-2xl">
          <p className="text-overline text-brand">PLANES</p>
          <h2 className="text-h1 text-primary">Empezá gratis. Pro está en preparación.</h2>
          <p className="text-body text-secondary">
            Hoy no hay suscripciones ni pagos activos. Primero queremos que el valor para cada tipo
            de coleccionista esté claro.
          </p>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Surface className="flex h-full flex-col gap-6 p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-h2 text-primary">Gratis</h3>
                <p className="text-body text-secondary">Lo que ya podés usar hoy.</p>
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
                <p className="text-body text-secondary">Para seguir colecciones grandes de cerca.</p>
              </div>
              <Badge tone="brand">En preparación</Badge>
            </div>
            <p className="text-h2 text-primary">Próximamente</p>
            <ul className="flex flex-1 flex-col gap-3">
              {PRO_PREVIEW.map((feature) => (
                <PlanFeature key={feature}>{feature}</PlanFeature>
              ))}
            </ul>
            <Link
              href="/faq#faq-planes"
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
            >
              Qué estamos preparando
            </Link>
            <p className="text-caption text-tertiary">
              Estas funciones todavía no están disponibles ni tienen precio. No hay ningún cobro activo.
            </p>
          </Surface>
        </div>
      </section>

      <section className="border-y border-line-subtle bg-brand-soft">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-h2 text-primary">¿Cuál es la primera carta que vas a sumar?</h2>
            <p className="text-body text-secondary">Probá el escáner o empezá por buscar una que ya conocés.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/escanear" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'px-5')}>
              Escanear una carta
            </Link>
            <Link href="/buscar" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-5')}>
              Buscar en catálogo
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
