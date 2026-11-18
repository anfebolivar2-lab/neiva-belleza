// Arma la app de Android (Trusted Web Activity) que abre https://neiva-belleza.vercel.app a pantalla completa.
// Uso: ANDROID_HOME=... CLAVE_FIRMA=... LLAVE=ruta/neiva-belleza.keystore node app-android/construir-apk.js
// La llave de firma NO va en el repositorio: la guarda la dueña (sin ella no se pueden publicar actualizaciones).
const path = require('path');
const fs = require('fs');
const bw = require(process.env.BUBBLEWRAP || '@bubblewrap/core');

const VERSION = 1; // súbelo en 1 cada vez que publiques una versión nueva
const SITIO = 'neiva-belleza.vercel.app';
const ICONOS = 'https://raw.githubusercontent.com/anfebolivar2-lab/neiva-belleza/main/salon-belleza/img';

(async () => {
  const log = new bw.ConsoleLog('apk');
  const dir = path.resolve(process.env.SALIDA || path.join(__dirname, 'proyecto'));
  fs.mkdirSync(dir, { recursive: true });
  const manifiesto = new bw.TwaManifest({
    packageId: 'co.neivabelleza.app',
    host: SITIO,
    name: 'Neiva Belleza · Salón & Spa',
    launcherName: 'Neiva Belleza',
    display: 'standalone',
    orientation: 'portrait',
    themeColor: '#4b2f2c',
    themeColorDark: '#4b2f2c',
    navigationColor: '#4b2f2c',
    navigationColorDark: '#4b2f2c',
    navigationDividerColor: '#4b2f2c',
    navigationDividerColorDark: '#4b2f2c',
    backgroundColor: '#faf5f1',
    enableNotifications: false,
    startUrl: '/index.html?origen=app',
    iconUrl: `${ICONOS}/icono-512.png`,
    maskableIconUrl: `${ICONOS}/icono-maskable-512.png`,
    splashScreenFadeOutDuration: 300,
    signingKey: { path: process.env.LLAVE, alias: 'neivabelleza' },
    appVersionName: `1.${VERSION - 1}`,
    appVersionCode: VERSION,
    shortcuts: [
      { name: 'Reservar', shortName: 'Reservar', url: '/index.html?origen=app#reservar', chosenIconUrl: `${ICONOS}/icono-192.png` },
      { name: 'Panel del salón', shortName: 'Panel', url: '/admin.html', chosenIconUrl: `${ICONOS}/icono-192.png` },
    ],
    generatorApp: 'bubblewrap-core',
    webManifestUrl: `https://${SITIO}/manifest.webmanifest`,
    fallbackType: 'customtabs',
    features: {},
    enableSiteSettingsShortcut: false,
    isChromeOSOnly: false,
    isMetaQuest: false,
    minSdkVersion: 24, // Android 7 o más nuevo
  });
  await new bw.TwaGenerator().createTwaProject(dir, manifiesto, log);
  fs.writeFileSync(path.join(dir, 'twa-manifest.json'), JSON.stringify(manifiesto.toJson(), null, 2));

  const config = new bw.Config(process.env.JAVA_HOME, process.env.ANDROID_HOME);
  const jdk = new bw.JdkHelper(process, config);
  const sdk = await bw.AndroidSdkTools.create(process, config, jdk, log);
  if (!process.env.SIN_GRADLE) await new bw.GradleWrapper(process, sdk, dir).assembleRelease();
  const sinFirma = path.join(dir, 'app/build/outputs/apk/release/app-release-unsigned.apk');
  const alineado = path.join(dir, 'app-release-alineado.apk');
  const final = path.resolve(process.env.APK || path.join(__dirname, 'neiva-belleza.apk'));
  await sdk.zipalign(sinFirma, alineado);
  await sdk.apksigner(process.env.LLAVE, process.env.CLAVE_FIRMA, 'neivabelleza', process.env.CLAVE_FIRMA, alineado, final);
  console.log('APK lista:', final);
})().catch((e) => { console.error(e); process.exit(1); });
