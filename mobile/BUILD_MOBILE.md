# KixxMe — Empaquetado móvil (Google Play + App Store)

KixxMe ya es una **PWA instalable** (manifest, service worker e iconos están en
`artifacts/kixxme/public/`). Esta carpeta contiene lo necesario para envolver esa
PWA en apps nativas para las tiendas.

> Requisito previo para ambas tiendas: `https://kixxme.com` debe estar **publicado
> y verificado** (HTTPS válido). Las apps cargan ese dominio.

---

## 1. Google Play (Android `.aab` con Bubblewrap / TWA)

La app Android es un **TWA** (Trusted Web Activity): una ventana de Chrome a
pantalla completa que carga `kixxme.com`. Se genera con Bubblewrap.

1. Instala las herramientas (una sola vez, en tu equipo con Node + JDK 17):
   ```bash
   npm i -g @bubblewrap/cli
   ```
2. Inicializa el proyecto usando el manifest ya preparado:
   ```bash
   bubblewrap init --manifest mobile/twa-manifest.json
   ```
   (o `bubblewrap init --manifest https://kixxme.com/manifest.json`)
3. Genera el paquete firmado:
   ```bash
   bubblewrap build
   ```
   Esto crea `app-release-bundle.aab` (lo que se sube a Play) y un keystore.
4. **Vincula la firma con el dominio** (Digital Asset Links):
   - Obtén la huella SHA-256 de tu clave de firma:
     ```bash
     keytool -list -v -keystore android.keystore -alias android
     ```
     (o cópiala desde Play Console → *App integrity* → *App signing key*).
   - Pega esa huella en `artifacts/kixxme/public/.well-known/assetlinks.json`
     (sustituye `REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT`).
   - **Vuelve a publicar** la web para que
     `https://kixxme.com/.well-known/assetlinks.json` sirva la huella correcta.
     Sin esto, la app abrirá con la barra de URL de Chrome visible.
5. Sube el `.aab` en **Play Console** → *Production* (o *Internal testing* primero).

> Si Play habilita *Play App Signing* (recomendado y por defecto), la huella
> SHA-256 que va en `assetlinks.json` es la que muestra Play Console, **no** la de
> tu keystore local.

---

## 2. App Store (iOS)

Apple no acepta TWAs. Dos caminos válidos para una PWA:

**Opción A — PWABuilder (la más rápida):**
1. Entra en https://www.pwabuilder.com e introduce `https://kixxme.com`.
2. Pestaña **iOS** → *Generate Package*. Descarga el proyecto Xcode generado.
3. Ábrelo en **Xcode** (requiere macOS), firma con tu Apple Developer Team y
   sube con *Archive → Distribute App* a App Store Connect.

**Opción B — Capacitor (más control, permite plugins nativos):**
```bash
# dentro de artifacts/kixxme
npm i @capacitor/core @capacitor/ios
npx cap init KixxMe com.kixxme.app --web-dir=dist/public
npx cap add ios
npm run build && npx cap sync
npx cap open ios   # abre Xcode para firmar y subir
```

---

## 3. Recursos de tienda (necesarios en ambas consolas)

- **Icono** 512×512 (Play) / 1024×1024 (App Store) — derivable de
  `public/icons/` o de los SVG fuente.
- **Capturas de pantalla** de teléfono (mín. 2). Play también pide un *feature
  graphic* 1024×500.
- **Política de privacidad** (URL pública) — obligatoria.
- **Clasificación de contenido +18** (app de citas): activa verificación de edad
  y describe el sistema de reportes/moderación (ya implementado en KixxMe).
- Cuenta de desarrollador: Google Play 25 USD (pago único) · Apple 99 USD/año.
