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
      // Set to 500ms so the splash disappears quickly and the WebView becomes
      // visible almost immediately — helps diagnose blank/black screen issues.
      launchShowDuration: 500,
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
