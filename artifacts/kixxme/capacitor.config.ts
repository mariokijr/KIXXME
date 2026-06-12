import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kixxme.app",
  appName: "KixxMe",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  ios: {
    // LiveKit/WebRTC needs inline playback; Capacitor enables
    // allowsInlineMediaPlayback by default. Keep app-bound domains off so
    // getUserMedia + remote origins keep working inside WKWebView.
    limitsNavigationsToAppBoundDomains: false,
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
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
