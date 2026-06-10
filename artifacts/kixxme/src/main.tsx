import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./pwa";

createRoot(document.getElementById("root")!).render(<App />);

registerServiceWorker();
