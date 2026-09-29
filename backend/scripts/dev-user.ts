import 'reflect-metadata';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Usuario de pruebas estable para desarrollo.
 *
 * Se corre a mano (`pnpm run db:dev-user`) y es idempotente: si el usuario ya
 * existe solo le actualiza la contraseña, así que sirve tanto para crearlo la
 * primera vez como para restaurarlo después de un `db:reset`.
 */

const EMAIL = 'test@test.com';
const PASSWORD = '12345678';
const USERNAME = 'test';
const DISPLAY_NAME = 'Usuario de Pruebas';

const log = (...args: unknown[]): void => {
  console.log('[dev-user]', ...args);
};

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const passwordHash = await argon2.hash(PASSWORD);
    const data = { email: EMAIL, passwordHash, username: USERNAME, displayName: DISPLAY_NAME };

    const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
    const user = existing
      ? await prisma.user.update({ where: { email: EMAIL }, data })
      : await prisma.user.create({ data });

    log(existing ? 'actualizado' : 'creado', `${user.email} (${user.username})`);
    log('password:', PASSWORD);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[dev-user] falló:', error);
  process.exitCode = 1;
});
