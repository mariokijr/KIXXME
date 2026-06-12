import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./pwa";
import { initNativeRuntime, isNativeApp } from "./lib/native";

// Point the API client at the production origin when running natively.
initNativeRuntime();

createRoot(document.getElementById("root")!).render(<App />);

// The service worker is web-only; on the native shell it is pointless and the
// local app scheme can break it.
if (!isNativeApp) {
  registerServiceWorker();
}
