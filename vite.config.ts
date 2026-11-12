import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { VitePWA } from "vite-plugin-pwa";

// BASE_PATH lets the same build run at a sub-path (GitHub Pages: /repo-name/).
// TARGET=desktop builds the Windows app (no service worker — Electron serves files itself).
const base = process.env.BASE_PATH || "/";
const desktop = process.env.TARGET === "desktop";

export default defineConfig(({ mode }) => ({
  base,
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  define: {
    "import.meta.env.VITE_DESKTOP": JSON.stringify(desktop ? "1" : ""),
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
    !desktop &&
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null, // registered manually in main.tsx (skipped in demo/desktop)
        manifest: false, // we ship public/manifest.json
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
          globIgnores: ["guide/**"],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/~oauth/, /\/\.lovable\//],
          // never cache the database / auth traffic — that always goes live
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
      }),
  ].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
