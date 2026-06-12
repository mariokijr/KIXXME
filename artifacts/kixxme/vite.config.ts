import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async ({ command }) => {
  const basePath = process.env.BASE_PATH;

  if (!basePath) {
    throw new Error(
      "BASE_PATH environment variable is required but was not provided.",
    );
  }

  // PORT only matters for the dev/preview server. A production `vite build`
  // (web deploy or the Capacitor mobile bundle) does not need it.
  let port = 5173;
  if (command === "serve") {
    const rawPort = process.env.PORT;
    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }
    port = Number(rawPort);
    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
  }

  // Absolute origin the native (Capacitor) bundle should call for the API.
  // Empty on the web build, where the API is same-origin via the proxy.
  const apiOrigin = process.env.MOBILE_API_ORIGIN ?? "";

  const replitDevPlugins =
    command === "serve" && process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : [];

  return {
    base: basePath,
    define: {
      __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL ?? ""),
      __SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ""),
      __API_ORIGIN__: JSON.stringify(apiOrigin),
      // Public, platform-scoped RevenueCat SDK keys for the native bundle.
      // Empty on the web build; set when building the mobile app.
      __RC_IOS_KEY__: JSON.stringify(process.env.REVENUECAT_IOS_KEY ?? ""),
      __RC_ANDROID_KEY__: JSON.stringify(process.env.REVENUECAT_ANDROID_KEY ?? ""),
    },
    plugins: [react(), tailwindcss(), runtimeErrorOverlay(), ...replitDevPlugins],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
        // The native plugin's web fallback statically imports the Firebase JS
        // SDK, but we never run it on web (push is native-only). Stub it so the
        // bundle resolves without shipping the SDK.
        "firebase/messaging": path.resolve(
          import.meta.dirname,
          "src/lib/firebase-messaging-stub.ts",
        ),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
