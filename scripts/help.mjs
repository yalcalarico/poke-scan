#!/usr/bin/env node
// Lista los comandos disponibles de la app.
// Se usa desde `pnpm run help`.
const SCRIPTS = [
  ['— Arranque —', null],
  ['setup', 'Instalar todo desde cero (primera vez): deps + infra + schema'],
  ['dev', 'Levantar API + web en paralelo (Ctrl+C baja ambos)'],
  ['dev:lan', 'Levantar HTTPS en la red local para probar el celu y la cámara'],
  ['lan:cert', 'Preparar el certificado local para instalar en el celu'],
  ['dev:api', 'Levantar solo la API, en watch'],
  ['dev:web', 'Levantar solo el frontend'],
  ['stop', 'Matar procesos de dev por los puertos'],

  ['— Infraestructura —', null],
  ['infra:up', 'Levantar PostgreSQL y Redis'],
  ['infra:down', 'Apagar contenedores (conservan los datos)'],
  ['infra:logs', 'Ver logs de PostgreSQL y Redis'],
  ['infra:reset', '⚠  Destruir la base y empezar de cero (pide confirmación)'],

  ['— Base de datos —', null],
  ['db:migrate', 'Aplicar migraciones'],
  ['db:push', 'Sincronizar el schema sin migraciones'],
  ['db:generate', 'Regenerar el cliente Prisma'],
  ['db:studio', 'Abrir Prisma Studio (GUI)'],
  ['db:fix-images', 'Corregir URLs de cartas verificadas (--apply; sin opciones muestra plan)'],
  ['db:stats', 'Ver cuántos registros hay de cada cosa'],
  ['db:reset', 'Vaciar la base y reaplicar el schema'],
  ['test:db:setup', 'Crear/renovar la copia de tests (solo *_test)'],

  ['— Datos —', null],
  ['seed', 'Importar 2 páginas de cartas (rápido, para probar)'],
  ['sync', '⚠  Sincronizar catálogo completo (~20.670 cartas, varios minutos)'],
  ['sync-state:migrate', 'Migrar el cursor del sync desde Redis a Postgres (una vez)'],
  ['prices:retention', 'Consolidar/podar card_prices (dry run por default)'],
  ['cache:clear', 'Vaciar la caché de Redis'],

  ['— Escáner visual experimental —', null],
  ['scanner:index:sets', 'Completar hasta N sets por nombre (--limit N --dry-run)'],
  ['scanner:validate', 'Validar pertenencia y cartas faltantes contra el catálogo local'],
  ['scanner:sets', 'Listar expansiones del catálogo local'],
  ['scanner:index', 'Descargar/indexar imágenes: --set ID --limit N (--help)'],
  ['scanner:evaluate', 'Evaluar fotos etiquetadas contra el índice local'],

  ['— Calidad —', null],
  ['check', 'lint + types + tests + build'],
  ['test', 'Todos los tests'],
  ['test:backend', 'Tests del backend'],
  ['verify:app', 'Smoke test HTTP del stack corriendo (cartas, precios, colecciones, UI)'],
  ['test:frontend', 'Tests del frontend'],
  ['lint', 'Lint en backend y frontend'],
  ['typecheck', 'Typecheck del frontend'],
  ['build', 'Build de producción'],
  ['doctor', 'Diagnóstico: ver que todo esté en orden'],
  ['clean', 'Borrar builds y caches'],

  ['— Deploy —', null],
  ['build:docker', 'Construir las imágenes de producción (perfil deploy)'],
];

const b = (s) => `\x1b[1m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;
const c = (s) => `\x1b[36m${s}\x1b[0m`;
const g = (s) => `\x1b[32m${s}\x1b[0m`;

console.log(`\n${b('Pokémon Cards Scanner')} ${d('— comandos')}\n`);
for (const [name, desc] of SCRIPTS) {
  if (desc === null) {
    console.log(`  ${d(name)}`);
  } else {
    console.log(`  ${c(name.padEnd(14))} ${desc}`);
  }
}
console.log(`\n${d('Arranque rápido:')}  pnpm run setup  ${d('→')}  pnpm run dev`);
console.log(`${d('Atajo:')} make <comando>  ${d('funciona si aceptás la licencia de Xcode o instalás gmake)')}\n`);
console.log(`${g('Web →')} http://localhost:3000   ${g('API →')} http://localhost:3001/api/health\n`);
