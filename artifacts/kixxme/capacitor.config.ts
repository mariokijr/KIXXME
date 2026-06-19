import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kixxme.app",
  appName: "KixxMe",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#080712",
  },
  ios: {
    limitsNavigationsToAppBoundDomains: false,
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#080712",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
