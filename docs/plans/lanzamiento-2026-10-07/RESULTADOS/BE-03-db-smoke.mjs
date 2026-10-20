import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  dbNameOf,
  resolveTestDatabaseUrl,
  resolveDevDatabaseUrl,
} from "../../../../backend/test/test-env.ts";
import {
  boundedDatabaseUrl,
  ReadinessService,
} from "../../../../backend/dist/readiness.service.js";

// Usá las dependencias instaladas del backend, sin instalar otro runtime.
const require = createRequire(
  new URL("../../../../backend/package.json", import.meta.url),
);
const { PrismaClient, Prisma } = require("@prisma/client");
const resolved = resolveTestDatabaseUrl();
const name = dbNameOf(resolved);
const devName = dbNameOf(resolveDevDatabaseUrl());
assert(
  resolved && /test/i.test(name) && name !== devName,
  "Guard: solo se admite la base resuelta por test-env, distinguible de desarrollo.",
);

const tag = `be03-readiness-${randomUUID()}`;
function readOnlyUrl(applicationName) {
  const url = new URL(boundedDatabaseUrl(resolved));
  url.searchParams.set(
    "options",
    `${url.searchParams.get("options")} -c default_transaction_read_only=on -c application_name=${applicationName}`,
  );
  return url.toString();
}
const client = new PrismaClient({ datasourceUrl: readOnlyUrl(tag) });
const observer = new PrismaClient({
  datasourceUrl: readOnlyUrl(`${tag}-observer`),
});
const service = new ReadinessService(client);
try {
  const settings = await client.$queryRaw(
    Prisma.sql`SELECT current_setting('transaction_read_only') AS read_only, current_setting('statement_timeout') AS timeout, current_setting('application_name') AS application`,
  );
  assert.equal(settings[0].read_only, "on");
  assert.equal(settings[0].timeout, "750ms");
  assert.equal(settings[0].application, tag);
  assert.equal(await service.databaseState(), "ready");

  const started = performance.now();
  let cancelled = false;
  try {
    await client.$queryRaw(Prisma.sql`SELECT pg_sleep(2)`);
  } catch (error) {
    cancelled =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      error.meta?.code === "57014";
  }
  const elapsedMs = Math.round(performance.now() - started);
  assert(
    cancelled,
    "La consulta debe cancelarse en PostgreSQL con SQLSTATE 57014.",
  );
  assert(
    elapsedMs >= 650 && elapsedMs < 1_500,
    "El timeout debe ocurrir cerca del límite server-side, antes del socket_timeout de 1 s más tolerancia.",
  );
  const activity = await observer.$queryRaw(
    Prisma.sql`SELECT count(*)::int AS active FROM pg_stat_activity WHERE application_name = ${tag} AND state = 'active' AND query LIKE ${"%pg_sleep%"}`,
  );
  assert.equal(activity[0].active, 0);
  console.log(
    JSON.stringify({
      database: "DB_TEST",
      readOnly: true,
      select1: "ready",
      sqlstate: "57014",
      elapsedMs,
      orphanedSleepQueries: activity[0].active,
    }),
  );
} catch {
  console.error(
    "Falló la validación acotada DB_TEST; no se imprimen URL, credenciales ni mensajes del datasource.",
  );
  process.exitCode = 1;
} finally {
  await Promise.all([service.onModuleDestroy(), observer.$disconnect()]);
}
