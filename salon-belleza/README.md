# Neiva Belleza: página web y panel del salón

Página para clientas (reservas, tienda, regalos) y panel interno para el equipo del salón.
Usa HTML, CSS y JavaScript sin librerías. La base de datos real está en **Supabase**.

## 1. Publicar la página

**Publicada en Vercel:** <https://neiva-belleza.vercel.app> (proyecto `neiva-belleza` en la cuenta de Vercel de la dueña).
- Vercel ejecuta `construir.sh`, que descarga esta carpeta del repositorio <https://github.com/anfebolivar2-lab/neiva-belleza> y la publica.
- Para subir una versión nueva, vuelve a desplegar en Vercel: toma lo último de la rama `main`.
- También puedes conectar el repositorio en Vercel (opción B) para que cada cambio se publique solo.

### Opción A: Netlify Drop (sin instalar nada)
1. Entra a <https://app.netlify.com/drop> con tu cuenta.
2. Arrastra esta carpeta `salon-belleza` completa.
3. Netlify te da el enlace en segundos. El proyecto `neiva-belleza` ya está creado; para usarlo, sube la carpeta desde su pestaña **Deploys**.
4. En **Project configuration → Visitor access**, quita la opción que pide iniciar sesión, porque los proyectos nuevos quedan privados.

### Opción B: Netlify o Vercel conectado a GitHub
- Importa este repositorio y pon como carpeta base `salon-belleza`. No necesita comando de compilación.
- Cada cambio que se suba a GitHub se publica solo.
- Los archivos `netlify.toml` y `vercel.json` ya traen los encabezados de seguridad.

### Después de publicar
- En Supabase → **Authentication → URL Configuration**:
  - pon `https://neiva-belleza.vercel.app` en **Site URL**;
  - agrega `https://neiva-belleza.vercel.app/admin.html` en **Redirect URLs**.
  - Así funcionan los correos de confirmar cuenta y recuperar contraseña.
- Si el dominio no es `neiva-belleza.vercel.app`, cámbialo en `sitemap.xml`, `robots.txt` y en las etiquetas `og:` y `canonical` de `index.html`.

## 2. Primer ingreso al panel
1. Abre `admin.html` y elige **"Soy nueva en el equipo: crear cuenta"** con el correo **anfebolivar@gmail.com**. Ese correo queda como **dueña** automáticamente.
2. Las demás personas crean su cuenta igual. Les aparece "espera aprobación" hasta que la dueña, en **Inicio** o en **Equipo**, les asigne un rol:
   - **Recepción**: agenda, clientas, caja, inventario, pedidos, regalos y reseñas.
   - **Estilista**: solo su agenda, sus comisiones y la galería.

## 3. Conexiones (se activan cuando pongas las llaves)
Mientras falte una llave, esa función aparece como **"Pendiente de conectar"** y la página sigue funcionando sin ella. No se simula nada.

| Servicio | Para qué | Dónde se pone |
|---|---|---|
| Google Analytics | Contar visitas y reservas | Panel → Configuración (ID `G-…`) |
| Píxel de Meta | Anuncios de Facebook/Instagram | Panel → Configuración |
| Reseñas de Google | Enlace "déjanos tu reseña" | Panel → Configuración |
| **Wompi** | Pagos en línea (Nequi, PSE, tarjeta) de tarjetas de regalo y pedidos | Supabase → Edge Functions → Secrets: `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`. En Wompi, URL de eventos: `https://xctqgizrmhzddtrvlnjh.supabase.co/functions/v1/integraciones/wompi/evento` |
| **WhatsApp Business API** | Recordatorios automáticos el día antes | Secrets: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` y, si quieres, `WHATSAPP_PLANTILLA` (por defecto `recordatorio_cita`, con 4 variables: nombre, hora, profesional, enlace) |
| **Asistente virtual** | Chat que responde con precios y horarios reales | Secret `ANTHROPIC_API_KEY`. Luego, en el panel, marca "Mostrar el asistente" |
| Facturación DIAN | Factura electrónica | Pendiente: hay que elegir un proveedor autorizado (Alegra, Siigo, etc.) |

Panel → Configuración muestra el estado de cada conexión.

## 4. Archivos
| Archivo | Qué es |
|---|---|
| `index.html`, `script.js`, `extras.js`, `styles.css` | Página pública: reserva, tienda, regalos, opiniones, galería, novias, preguntas, mapa, inglés |
| `cita.html`, `cita.js` | "Mi cita": confirmar, cambiar, cancelar y dejar opinión |
| `admin.html`, `admin.js`, `admin-extras.js`, `admin.css` | Panel del salón |
| `api.js` | Conexión con Supabase (base de datos, cuentas, fotos y funciones) |
| `datos.js` | Datos de respaldo si no hay internet y cálculos compartidos (horarios, duraciones) |
| `supabase/functions/integraciones/` | Función del servidor para Wompi, WhatsApp y el asistente. Ya está publicada en Supabase |
| `manifest.webmanifest`, `sw.js` | Para instalar la página en el celular y abrirla sin señal |
| `terminos.html`, `privacidad.html` | Términos y política de datos (Ley 1581) |

Los precios, servicios, equipo, horarios, festivos y fotos se cambian desde el panel, sin tocar código.

## 5. Pruebas
```bash
node capturas/pruebas/tanda1.js   # reservas
node capturas/pruebas/tanda2.js   # panel completo y roles
node capturas/pruebas/tanda3.js   # tienda, regalos, cupón, reseñas, galería, inglés, celular
```
Usan Playwright con un simulador de Supabase, así que no tocan la base real. Las capturas quedan en `capturas/`.

Las funciones de la base de datos también se probaron en Supabase dentro de una transacción que se deshace, así que no dejan datos de prueba.

## 6. App para Android
- **Descarga:** `descargas/neiva-belleza.apk`. Se baja desde la pantalla de ingreso del panel y desde el pie de la página.
- **Qué es:** una app de verdad (Trusted Web Activity) que abre `https://neiva-belleza.vercel.app` a pantalla completa, con el ícono del salón.
  - Como la app muestra la página publicada, cualquier cambio en la página llega solo a la app, sin reinstalar.
  - Requisitos: Android 7 o más nuevo y Google Chrome instalado.
- **Pantalla completa:** `.well-known/assetlinks.json` le dice a Android que la app y la página son del mismo dueño, para que no salga la barra de direcciones. Si se cambia la llave de firma, hay que actualizar la huella en ese archivo.
- **Llave de firma:** `neiva-belleza.keystore` y su contraseña **no** están en el repositorio. Las guarda la dueña. Sin esa llave no se puede publicar una versión nueva que se instale encima de la anterior.
- **Para armar una versión nueva:**
  1. En `app-android/construir-apk.js` sube `VERSION` en 1.
  2. Con el Android SDK y Java instalados, corre:
     ```bash
     ANDROID_HOME=... LLAVE=ruta/neiva-belleza.keystore CLAVE_FIRMA=... node app-android/construir-apk.js
     ```
- **Para Google Play:** usa la misma llave y el mismo paquete (`co.neivabelleza.app`).

## 7. La base de datos
- **Proyecto en Supabase:** `neiva-belleza` (`xctqgizrmhzddtrvlnjh`).
- **Para reconstruirla desde cero:** en **SQL Editor** ejecuta en orden los archivos de `supabase/migrations/`:
  - `0001_tablas.sql`: tablas y reglas de acceso;
  - `0002_funciones.sql`: funciones;
  - `0003_datos.sql`: datos iniciales.
- **Si el proyecto se pausa:** Supabase gratis lo pausa cuando pasa una semana sin uso. En Supabase toca **Restore project**.
- **Versión con Firebase:** está guardada en la rama `firebase` del repositorio.
