# Controles de cuenta

`/ajustes/clave` pide clave actual/nueva/confirmación. El POST usa la cola existente de mutaciones de sesión, bearer actual y comprobación de época antes/después; nunca refresh/replay automático. Sólo éxito exacto limpia su propia sesión dentro de la cola y ofrece login manual. Error incierto no declara éxito y propone comprobar login antes de repetir. Los campos se vacían tras el intento, al salir y al cambiar la cuenta; no se almacenan ni viajan en URLs.

La ruta de clave no redirige tras logout confirmado: mantiene visible el resultado y la salida manual a login. Invitados sólo ven el acceso para iniciar sesión.

Pruebas: `pnpm --dir frontend exec vitest run lib/api/account.test.ts components/settings/password-settings.test.tsx`.
