# Probar desde el celu en la red local

La computadora y el celu tienen que estar en la misma red. No necesitás Cloudflare,
un dominio ni abrir puertos del router. El modo LAN escucha en la IP privada de la
computadora y usa HTTPS para permitir la cámara.

## Primera vez

1. Corré `pnpm run lan:cert`. Detecta tu IPv4 privada y genera una CA local y un
   certificado HTTPS con OpenSSL (incluido en macOS; en Linux debe estar instalado).
2. Pasá **solo** `.certificates/pokescan-rootCA.crt` al celu, por ejemplo por AirDrop
   o USB. Las claves `*-key.pem` quedan en la computadora; no las compartas.
3. Instalá y confiá la CA en el celu:
   - **iPhone:** abrí el certificado, instalá el perfil desde Ajustes → General →
     VPN y administración de dispositivos. Después, en General → Información →
     Ajustes de confianza de certificados, activá la confianza para
     «PokeScan desarrollo local».
   - **Android:** instalalo como certificado de CA desde Ajustes → Seguridad →
     Cifrado y credenciales → Instalar certificado (los nombres varían según el
     fabricante). Usá Chrome para probar.
4. Corré `pnpm run dev:lan` y abrí en el celu la URL que imprime, por ejemplo
   `https://192.168.1.45:3000/inicio`. Permití el uso de la cámara cuando lo pida.

La CA permite confiar en los certificados que firma. Instalá únicamente la que
generaste vos y quitá el perfil/certificado del celu cuando termines de probar.
No hace falta modificar la confianza de certificados de la computadora para
usar el celu. No alcanza con ignorar una advertencia de HTTPS: el certificado
tiene que estar instalado y confiado para probar la cámara.

## Uso diario

```bash
pnpm run stop
pnpm run dev:lan
```

Ctrl+C apaga web y API. `pnpm run dev` sigue siendo el modo HTTP habitual.
Si hay varias interfaces activas, elegí la IP de la red donde está el celu:

```bash
LAN_IP=192.168.1.45 pnpm run dev:lan
```

También acepta `API_PORT` y `WEB_PORT`. Si el router cambia la IP de la computadora,
volvé a ejecutar el comando y usá la nueva dirección. Se renueva el certificado
del servidor conservando la CA; no tenés que reinstalarla en el teléfono.

## Cómo funciona

En este modo el browser consulta `/api` en el mismo origen HTTPS. Next lo reenvía
a la API local por HTTP; así no hay contenido mixto ni hace falta ampliar CORS.
Los Server Components consultan directamente la API usando una URL absoluta.
El proxy solo se activa en desarrollo con `DEV_API_PROXY_TARGET`; el script fija
esa variable y `NEXT_PUBLIC_API_URL` sin modificar los archivos `.env`.

El script también fija `FRONTEND_URL` y `CORS_ORIGINS` para admitir la URL HTTPS
exacta que imprime (IP y puerto), junto con localhost/127.0.0.1 en el puerto web.
La protección de sesión sigue exigiendo `X-Session-Request`; no admite cualquier
IP de la red. Esto evita que login, refresh y logout fallen con «Origen de sesión
no permitido» al pasar por el proxy. Cambiar de IP o puerto exige reiniciar con
`pnpm run dev:lan`, para actualizar certificado y origen permitido.

Los certificados y claves están en `.certificates/`, fuera de Git y de los
archivos públicos de Next. La CA dura diez años y el certificado del servidor un
año; el script renueva este último si faltan menos de siete días o cambia la IP.

Si no abre, revisá que la computadora siga encendida, ambos dispositivos estén en
la misma red y el firewall permita conexiones al puerto web. Las redes de
invitados pueden aislar dispositivos. Para esta prueba solo se necesita acceder
al puerto web; no expongas PostgreSQL ni Redis al teléfono.

Referencias para instalar y confiar certificados:
[Apple](https://support.apple.com/102390) ·
[Android / Pixel](https://support.google.com/pixelphone/answer/2844832?hl=es).

### Verificación de sesión LAN — 4 de octubre de 2026

Se comprobó el flujo a través del proxy HTTPS real, validando el certificado con
la CA local: login, refresh y logout respondieron 200; un Origin ajeno respondió
403. La cookie de renovación se emitió y rotó correctamente. `pnpm run check`
terminó verde (304 backend, 6 scripts, 6 API, 322 frontend y ambos builds).
Esta prueba verifica el servidor/proxy; no reemplaza la prueba física de Safari
con el certificado confiado en el teléfono.
