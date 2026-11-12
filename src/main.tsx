import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource/heebo/300.css";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/600.css";
import "@fontsource/heebo/700.css";
import "@fontsource/heebo/800.css";
import "@fontsource/assistant/400.css";
import "@fontsource/assistant/600.css";
import "@fontsource/assistant/700.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Installable app (PWA): register the offline service worker on the web build only.
// The Windows app (Electron) serves its own files, and dev mode must not cache anything.
if (import.meta.env.PROD && import.meta.env.VITE_DESKTOP !== "1" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
