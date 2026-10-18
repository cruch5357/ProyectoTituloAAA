# Probar desde iPhone

`localhost` en el iPhone es el iPhone. Usa la IPv4 del PC (`ipconfig`, adaptador con puerta de enlace), con ambos dispositivos conectados al mismo router. El PC puede estar conectado por Ethernet. La IP detectada al preparar esta guía fue **192.168.0.10**; puede cambiar.

## Acceso inmediato por Wi-Fi

Desde la raíz del proyecto, en dos terminales:

```powershell
# Terminal 1 (PostgreSQL y backend/.env deben estar preparados)
npm run dev:backend
# Terminal 2
npm run dev:mobile
```

Abre **http://192.168.0.10:5173** en Safari. Vite escucha en la red y reenvía `/api` a `127.0.0.1:3000`. Así login, cookies, adjuntos y API comparten el origen del frontend, sin apuntar al localhost del teléfono. Si tienes `frontend/.env.local`, cambia `VITE_API_URL` a `/api/v1` y reinicia Vite. No es necesario abrir CORS a todos los orígenes.

Si no carga: comprueba primero la URL en el PC, evita Wi-Fi de invitados/aislamiento de clientes y permite Node.js en el firewall **solo en redes privadas**. Si necesitas una regla explícita, ejecuta como administrador:

```powershell
New-NetFirewallRule -DisplayName 'Entrenamiento local' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173,4173 -Profile Private -RemoteAddress LocalSubnet
# Para retirarla después:
# Remove-NetFirewallRule -DisplayName 'Entrenamiento local'
```

No abras puertos en el router. `http://192.168…` sirve para revisar la web; no es un contexto seguro para service workers. El modo `dev` tampoco registra el service worker. Para probar la PWA completa usa build/preview con HTTPS.

## PWA con HTTPS local (sin publicar la aplicación)

Para instalar desde la pantalla de inicio usa el **build de producción con HTTPS**. El icono creado desde el servidor de desarrollo HTTP no comprueba esta configuración.

Desde la raíz, una sola vez (o si cambia la IP del PC):

```powershell
npm run mobile:https:setup
```

El script descarga mkcert desde su repositorio oficial, crea una CA exclusiva en `.certs/ca` y genera certificados para las IP locales. No instala confianza en Windows. Todas las claves están fuera del build y excluidas de Git.

Con `npm run dev:mobile` funcionando, abre en Safari del iPhone **http://192.168.138.1:5173/local-ca.cer** si compartes internet del PC por Bluetooth. Con ambos dispositivos conectados al router, usa **http://192.168.0.10:5173/local-ca.cer**. Descarga únicamente el certificado público.

1. Permite descargar el perfil. Ve a **Ajustes → Perfil descargado → Instalar** (o General → VPN y gestión de dispositivos).
2. Ve a **Ajustes → General → Información → Ajustes de confianza de los certificados** y activa la confianza del certificado local de mkcert. [Guía de Apple](https://support.apple.com/en-ie/102390).
3. Mantén la API funcionando y ejecuta en el PC:

   ```powershell
   npm run pwa:mobile
   ```

4. Abre **https://192.168.138.1:4173/** por Bluetooth o **https://192.168.0.10:4173/** por Wi-Fi, sin advertencias de certificado.
5. Elimina el icono HTTP anterior. Desde esta URL HTTPS usa Safari → Compartir → **Agregar a pantalla de inicio → Abrir como app web**. [Guía de Apple](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).

El certificado es solo para desarrollo en tus dispositivos. Nunca compartas archivos con `key` en el nombre. Puedes eliminar el perfil del iPhone cuando termines las pruebas. Para usuarios finales, el despliegue debe usar un dominio HTTPS con certificado público: no tendrán que instalar perfiles.

Comprueba login y recarga para verificar la sesión. El shell y las imágenes se guardan como recursos estáticos; las respuestas privadas de la API no se cachean. El PC y la API deben seguir encendidos para consultar datos. Para invitaciones y recuperación desde móvil, configura `FRONTEND_URL` en el backend con la URL HTTPS correspondiente y reinícialo.

## Verificación y prevención de pantallas en blanco

- `npm run test:pwa` verifica el build servido en 4173 con Chromium y WebKit: service worker controlador, apertura sin red del shell, ausencia de respuestas privadas en caché y recuperación cuando falla el bundle. Requiere `npx playwright install chromium webkit` y el servidor HTTPS activo. No sustituye la instalación en un iPhone físico.
- El HTML muestra contenido inmediatamente, incluso antes de React, y permite reintentar tras 12 segundos si el bundle no llega.
- Las pantallas se descargan por separado. Los fallos de renderizado/rutas tienen recuperación y la comprobación de sesión se cancela a los 8 segundos si no responde.
- La lectura de APP_TIMEZONE del backend usa un parser sin efectos laterales. No utilizar Vite.loadEnv para leer backend/.env: también copia NODE_ENV a VITE_USER_NODE_ENV, convirtiendo el build en development y eliminando el registro de service worker condicionado a PROD.

Referencias: [mkcert](https://github.com/FiloSottile/mkcert), [Vite](https://vite.dev/config/server-options), [MDN: service workers y HTTPS](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
