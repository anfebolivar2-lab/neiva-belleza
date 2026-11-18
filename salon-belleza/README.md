# Neiva Belleza: página web y panel del salón

Página para clientas (reservas, tienda, regalos) y panel interno para el equipo del salón.
Usa HTML, CSS y JavaScript sin librerías. La base de datos está en **Firebase** (Firestore + Authentication), en el plan gratis (Spark).

## 1. Conectar Firebase (una sola vez)
1. En <https://console.firebase.google.com> crea el proyecto `neiva-belleza`.
2. **Authentication → Comenzar →** activa **Correo electrónico/contraseña**.
3. **Firestore Database → Crear base de datos →** ubicación `nam5`, **modo de producción**.
4. **Firestore Database → Reglas:** borra lo que hay, pega todo el archivo `firebase/firestore.rules` y toca **Publicar**.
5. **Configuración del proyecto (⚙) → Tus apps → `</>` (Web):** regístrala y copia los datos de `firebaseConfig`.
6. Pon `apiKey`, `authDomain` y `projectId` al principio de `api.js` (en `const FIREBASE = {...}`). Son datos públicos: la seguridad la ponen las reglas.
7. **Authentication → Configuración → Dominios autorizados:** agrega `neiva-belleza.vercel.app`.

## 2. Primer ingreso al panel
1. Abre `admin.html` y elige **"Soy nueva en el equipo: crear cuenta"** con el correo **anfebolivar@gmail.com**.
2. Confirma el correo con el enlace que llega (revisa también el correo no deseado) y entra.
   - Ese correo queda como **dueña** automáticamente.
   - La primera vez que entra, el panel carga el catálogo inicial (`datos-iniciales.js`): servicios, equipo, productos, festivos, datos del salón y el cupón BIENVENIDA.
3. Las demás personas crean su cuenta igual y confirman su correo. Les aparece "espera aprobación" hasta que la dueña, en **Inicio** o en **Equipo**, les asigne un rol:
   - **Recepción**: agenda, clientas, caja, inventario, pedidos, regalos y reseñas.
   - **Estilista**: solo su agenda, sus comisiones y la galería.

## 3. Publicar la página
**Publicada en Vercel:** <https://neiva-belleza.vercel.app> (proyecto `neiva-belleza` en la cuenta de Vercel de la dueña).
- Vercel ejecuta `construir.sh`, que descarga esta carpeta del repositorio <https://github.com/anfebolivar2-lab/neiva-belleza> y la publica.
- Para subir una versión nueva, vuelve a desplegar en Vercel: toma lo último de la rama `main`.
- También puedes conectar el repositorio en Vercel para que cada cambio se publique solo (carpeta base `salon-belleza`, sin comando de compilación).
- `vercel.json` y `netlify.toml` traen los encabezados de seguridad (ya permiten Firestore y Authentication).

## 4. Cómo se protege la información
Las reglas (`firebase/firestore.rules`) deciden quién lee y cambia cada cosa:
- **Catálogo** (servicios, equipo, productos, festivos): lo ve todo el mundo; solo lo cambia el salón.
- **Citas:**
  - Cada cita se abre con su enlace secreto. Nadie de afuera puede listar las citas de otras clientas.
  - La clienta solo puede confirmar, cancelar o cambiar la hora con más de 24 horas de anticipación, y aplicar un cupón una sola vez con el descuento exacto.
- **Horarios sin cruces:**
  - Cada cita aparta casillas de 15 minutos (colección `casillas`).
  - Si dos personas intentan la misma hora, Firestore solo deja guardar a la primera.
- **Clientas, caja, gastos, inventario, historial:** solo el equipo, y cada parte según el rol.
- **Opiniones:** llegan sin publicar; salen en la página cuando la dueña o recepción las aprueban.
- **Fotos de la galería y del catálogo:** se reducen en el navegador y se guardan dentro de Firestore. El almacenamiento de archivos de Firebase pide el plan de pago.

Lo que el plan gratis no permite: en el plan gratis no hay funciones de servidor, así que algunas revisiones las hace la página:
- el límite de 3 citas por día por clienta;
- que el stock alcance al hacer un pedido.

Las reglas igual impiden lo más importante: cruzar citas, regalarse sellos o puntos, cambiar precios, ver datos de otras clientas y publicar opiniones sin revisión.

## 5. Conexiones
Mientras falte una conexión, esa función aparece como **"Pendiente de conectar"** y la página sigue funcionando sin ella. No se simula nada.

| Servicio | Para qué | Cómo se activa |
|---|---|---|
| Google Analytics | Contar visitas y reservas | Panel → Configuración (ID `G-…`) |
| Píxel de Meta | Anuncios de Facebook/Instagram | Panel → Configuración |
| Reseñas de Google | Enlace "déjanos tu reseña" | Panel → Configuración |
| **Wompi** (pagos en línea) | Pagar tarjetas de regalo y pedidos con Nequi, PSE o tarjeta | Necesita servidor: plan **Blaze** de Firebase + Cloud Functions. El código ya está escrito en `supabase/functions/integraciones/` y se puede pasar a Cloud Functions |
| **WhatsApp Business API** | Recordatorios automáticos el día antes | Igual que Wompi (plan Blaze) |
| **Asistente virtual** | Chat con precios y horarios reales | Igual que Wompi (plan Blaze) |
| Facturación DIAN | Factura electrónica | Pendiente: hay que elegir un proveedor autorizado (Alegra, Siigo, etc.) |

## 6. Archivos
| Archivo | Qué es |
|---|---|
| `index.html`, `script.js`, `extras.js`, `styles.css` | Página pública: reserva, tienda, regalos, opiniones, galería, novias, preguntas, mapa, inglés |
| `cita.html`, `cita.js` | "Mi cita": confirmar, cambiar, cancelar y dejar opinión |
| `admin.html`, `admin.js`, `admin-extras.js`, `admin.css` | Panel del salón |
| `api.js` | Conexión con Firebase: cuentas, datos, reservas, cupones, tienda, regalos, reportes y automatismos (sellos, stock, puntos, historial) |
| `firebase/firestore.rules` | Reglas de seguridad de Firestore (se pegan en la consola) |
| `firebase/firebase.json` | Configuración de los emuladores para las pruebas |
| `datos-iniciales.js` | Catálogo inicial que se carga la primera vez |
| `datos.js` | Datos de respaldo si no hay internet y cálculos compartidos (horarios, duraciones) |
| `manifest.webmanifest`, `sw.js` | Para instalar la página en el celular y abrirla sin señal |
| `terminos.html`, `privacidad.html` | Términos y política de datos (Ley 1581) |
| `supabase/` | Versión anterior con Supabase (base de datos en SQL y función de servidor), guardada como referencia |

Los precios, servicios, equipo, horarios, festivos y fotos se cambian desde el panel, sin tocar código.

## 7. Pruebas
Con los emuladores oficiales de Firebase y las reglas reales (no toca la base de datos de verdad):
```bash
cd salon-belleza/firebase && npx firebase-tools emulators:start --project demo-neiva --only auth,firestore
# en otra terminal, desde la raíz del repositorio:
node capturas/pruebas/firebase-emulador.js
```
Revisa 70 cosas:
- reservas, cruces de horario, festivos, cupones, cambios y cancelaciones;
- tienda, tarjetas de regalo y opiniones;
- caja, inventario, reportes y comisiones;
- roles del equipo y permisos de quien no tiene cuenta.

Las capturas quedan en `capturas/firebase/`. Las pruebas `tanda1-3.js` eran de la versión con Supabase.
