# KixxMe — Empaquetado nativo (iOS + Android con Capacitor)

KixxMe se empaqueta como app **nativa** con **Capacitor**. El frontend
(`artifacts/kixxme`) se compila a estáticos y se sirve dentro de un WebView
nativo; los proyectos nativos viven en `artifacts/kixxme/android` y
`artifacts/kixxme/ios`. El servidor de API (`artifacts/api-server`) se publica
aparte y la app nativa lo consume por su origen de producción.

- **appId:** `com.kixxme.app`  ·  **Nombre:** `KixxMe`
- **Compras (IAP):** RevenueCat (Apple App Store + Google Play Billing)
- **Push:** Firebase Cloud Messaging (Android directo; iOS vía APNs en Firebase)

> Replit **no** tiene Java/Android SDK/Xcode. Todo el código y la configuración
> están listos en el repo; **la compilación nativa, Firebase, APNs, el panel de
> RevenueCat y las fichas de tienda se hacen en tu equipo** siguiendo esta guía.

---

## 0. Requisitos

| Tarea | Necesitas |
| --- | --- |
| Build web + sync | Node 24, pnpm, `npx cap` |
| Android `.aab` | Android Studio + **JDK 17** |
| iOS `.ipa` | **macOS** + Xcode + CocoaPods + cuenta Apple Developer (99 USD/año) |
| Push | Proyecto Firebase (gratis) + clave APNs (cuenta Apple) |
| IAP | Cuenta RevenueCat + apps en App Store Connect y Google Play |
| Publicar API | API desplegada en HTTPS (ej. `https://api.kixxme.com`) |

---

## 1. Variables de entorno

### 1.1 Build del frontend (se incrustan en el bundle nativo)

Se inyectan vía `define` en `vite.config.ts`. Defínelas en el shell **antes** de
`pnpm --filter @workspace/kixxme run build`:

| Variable | Uso |
| --- | --- |
| `MOBILE_API_ORIGIN` | Origen de la API de producción (ej. `https://api.kixxme.com`). Lo usa `__API_ORIGIN__`; la app nativa hace `setBaseUrl()` con esto. |
| `REVENUECAT_IOS_KEY` | Clave **pública** del SDK de RevenueCat (app Apple). |
| `REVENUECAT_ANDROID_KEY` | Clave **pública** del SDK de RevenueCat (app Google). |
| `BASE_PATH` | **Debe ser `/`** para móvil (Capacitor sirve en la raíz). No uses `./`. |
| `PORT` | Cualquier valor; sólo lo exige el script de build. |

> Las claves de RevenueCat son públicas por plataforma (no son secretos). En el
> build web normal van vacías y el código de IAP nunca se activa (solo corre si
> `Capacitor.isNativePlatform()`).

### 1.2 Servidor de API (secrets en el deployment del backend)

| Variable | Uso |
| --- | --- |
| `REVENUECAT_SECRET_KEY` | Clave **secreta** de RevenueCat (REST v2) para re-consultar entitlements en el webhook. |
| `REVENUECAT_WEBHOOK_AUTH` | Secreto compartido; debe coincidir con el header `Authorization` configurado en el webhook de RevenueCat. |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de la cuenta de servicio de Firebase (en una sola línea) para enviar push con FCM v1. |
| `STRIPE_*`, `DATABASE_URL`, `SUPABASE_*` | Igual que la web (ya configurados). |

> El plan del usuario (`profiles.plan` en Supabase) se recalcula como el **máximo**
> entre la concesión de Stripe y la de RevenueCat (ledger Drizzle `plan_grants`),
> así ninguna fuente pisa a la otra.

---

## 2. Compilar y sincronizar

Desde la raíz del monorepo, cada vez que cambie el código web:

```bash
# 1) Compila el frontend (estáticos) con las env del paso 1.1
MOBILE_API_ORIGIN=https://api.kixxme.com \
REVENUECAT_IOS_KEY=appl_xxx REVENUECAT_ANDROID_KEY=goog_xxx \
BASE_PATH=/ PORT=5173 \
  pnpm --filter @workspace/kixxme run build

# 2) Copia el build + plugins a los proyectos nativos
cd artifacts/kixxme
npx cap sync        # = cap copy + cap update (instala/actualiza plugins)
```

`cap sync` regenera el contenido web embebido y vuelve a aplicar la config de
`capacitor.config.ts`. Hazlo siempre antes de abrir Android Studio / Xcode.

---

## 3. Iconos y splash

Las fuentes están en `artifacts/kixxme/assets/` (icono 1024×1024 sin alfa +
splash 2732×2732). Para regenerar todos los tamaños nativos:

```bash
cd artifacts/kixxme
npx @capacitor/assets generate --iconBackgroundColor '#080712' --splashBackgroundColor '#080712'
```

Esto escribe los recursos en `android/.../res` y en el catálogo de assets de iOS.

---

## 4. Firebase (push) — una sola vez

1. Crea un proyecto en https://console.firebase.google.com.
2. **Android:** *Add app* → Android, package `com.kixxme.app`. Descarga
   `google-services.json` y guárdalo como
   `artifacts/kixxme/android/app/google-services.json`
   (hay una plantilla `google-services.example.json` al lado). El plugin Gradle
   `google-services` se aplica **solo si el archivo existe**; sin él, el build
   Android compila igual pero el push queda desactivado.
3. **iOS:** *Add app* → iOS, bundle `com.kixxme.app`. Descarga
   `GoogleService-Info.plist`, guárdalo como
   `artifacts/kixxme/ios/App/App/GoogleService-Info.plist` (plantilla
   `GoogleService-Info.example.plist` al lado) y **arrástralo al target “App” en
   Xcode** para que se incluya en el bundle. `AppDelegate` llama a
   `FirebaseApp.configure()` solo si el plist está presente.
4. **APNs (iOS):** en *Apple Developer → Certificates, Identifiers & Profiles →
   Keys*, crea una **APNs Auth Key** (.p8). En Firebase → *Project settings →
   Cloud Messaging → Apple app configuration*, sube el .p8 con su **Key ID** y tu
   **Team ID**. Sin esto, el push no llega a iOS.
5. **Servidor:** en Firebase → *Project settings → Service accounts → Generate
   new private key*. Pega ese JSON (en una línea) como el secret
   `FIREBASE_SERVICE_ACCOUNT` del backend.

---

## 5. RevenueCat (IAP) — una sola vez

1. Crea un proyecto en RevenueCat y añade **dos apps**: una Apple App Store y una
   Google Play Store (vincula sus credenciales según el asistente de RC).
2. Copia las **claves públicas del SDK** de cada app a `REVENUECAT_IOS_KEY` /
   `REVENUECAT_ANDROID_KEY` (paso 1.1) y la **clave secreta** a
   `REVENUECAT_SECRET_KEY` (paso 1.2).
3. **Productos / suscripciones** — créalos en App Store Connect y Google Play con
   estos IDs (el cliente los mapea por estos identificadores):
   - `plus_monthly`, `plus_annual`
   - `gold_monthly`, `gold_annual`
4. **Entitlements** en RevenueCat: `plus` y `gold`. Asocia los productos `plus_*`
   al entitlement `plus` y los `gold_*` al entitlement `gold`.
5. **Offering** por defecto (`default`) con cuatro *packages* que apunten a esos
   cuatro productos.
6. **Webhook:** RevenueCat → *Integrations → Webhooks*:
   - URL: `https://api.kixxme.com/api/revenuecat/webhook`
   - Header `Authorization`: el mismo valor que `REVENUECAT_WEBHOOK_AUTH`.
   El servidor verifica el header, re-consulta los entitlements por REST (idempotente)
   y recalcula `profiles.plan`.

> En la app nativa la pantalla **Premium** usa RevenueCat (no Stripe), como exige
> Apple (regla 3.1.1). Incluye **“Restaurar compras”**. Stripe Checkout sigue
> siendo el flujo de la web.

---

## 6. Android — generar el `.aab`

```bash
cd artifacts/kixxme
npx cap open android      # abre Android Studio (usa JDK 17)
```

En Android Studio:
1. *Build → Generate Signed Bundle / APK → Android App Bundle*.
2. Crea (o reutiliza) tu **keystore** de subida y genera el `.aab` en `release`.
3. Sube el `.aab` en **Play Console** (empieza por *Internal testing*).

**Digital Asset Links / firma:**
- Con **Play App Signing** (recomendado, por defecto), la huella **SHA-256**
  relevante es la que muestra Play Console → *App integrity → App signing key*,
  **no** la de tu keystore local.
- Si usas deep links o verificación de dominio, pega esa huella en
  `artifacts/kixxme/public/.well-known/assetlinks.json` y **republica la web**.

---

## 7. iOS — archivar y subir (requiere macOS)

```bash
cd artifacts/kixxme/ios/App
pod install               # instala los pods (incl. Firebase)
cd ../..
npx cap open ios          # abre Xcode
```

En Xcode:
1. Selecciona el target **App** → *Signing & Capabilities*: elige tu **Team** y
   confirma el bundle id `com.kixxme.app`.
2. Añade las *Capabilities*: **Push Notifications** y **Background Modes →
   Remote notifications** (el `UIBackgroundModes` ya está en `Info.plist`).
3. Asegúrate de que `GoogleService-Info.plist` está en el target (paso 4.3).
4. *Product → Archive → Distribute App* → App Store Connect.

---

## 8. Fichas de tienda (ambas consolas)

- **Icono:** 512×512 (Play) / 1024×1024 (App Store).
- **Capturas:** mínimo 2 de teléfono; Play además pide *feature graphic* 1024×500.
- **Política de privacidad:** URL pública obligatoria (qué datos se recogen:
  perfil, fotos, ubicación aproximada, compras, identificadores de push).
- **Clasificación +18** (app de citas): activa verificación de edad y describe el
  sistema de reportes/moderación/bloqueos (ya implementado en KixxMe).
- **App Privacy (Apple) / Data safety (Google):** declara ubicación, fotos,
  identificadores y compras.
- **Cuentas de desarrollador:** Google Play 25 USD (pago único) · Apple 99 USD/año.

---

## 9. Checklist de publicación

- [ ] API desplegada en HTTPS y `APP_BASE_URL` apuntando a ella.
- [ ] `REVENUECAT_*` (cliente + servidor) y `FIREBASE_SERVICE_ACCOUNT` configurados.
- [ ] `google-services.json` y `GoogleService-Info.plist` reales en su sitio.
- [ ] Productos/entitlements/offering/webhook de RevenueCat creados.
- [ ] Clave APNs subida a Firebase.
- [ ] Build web (`BASE_PATH=/`) + `npx cap sync` ejecutados.
- [ ] `.aab` firmado subido a Play; archive subido a App Store Connect.
- [ ] Política de privacidad y clasificación +18 completadas en ambas consolas.
