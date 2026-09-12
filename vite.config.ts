import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const phpHost = env.VITE_PHP_HOST ?? 'http://127.0.0.1:3001';

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
          // Serve the cached app shell for any route navigation while offline
          // so /data-logger (and all other client routes) always open.
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          // Leaflet bundles can push chunks past the 2 MiB default.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // Cache basemap tiles as they're viewed so the maps still show terrain
          // offline (the "open your trail's map at home first" workflow). The
          // maps set crossOrigin, so these are CORS 200s (not opaque) — cheap to
          // store and evicted LRU past maxEntries. Same "map-tiles" cache the
          // per-trail offline download packs write into.
          runtimeCaching: [
            {
              urlPattern:
                /^https:\/\/(?:[a-z]\.tile\.openstreetmap\.org|server\.arcgisonline\.com|[a-z]\.tile\.opentopomap\.org)\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "map-tiles",
                expiration: {
                  maxEntries: 12000,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        manifest: {
          name: "PWV Insights",
          short_name: "PWV Insights",
          description:
            "Poudre Wilderness Volunteers analytics and patrol data logger",
          start_url: "/dashboard",
          scope: "/",
          display: "standalone",
          background_color: "#fafaf9",
          theme_color: "#059669",
          icons: [
            { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
    define: {
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    server: {
      proxy: {
        // Forward /api calls to your DreamHost PHP files during dev.
        // Set VITE_PHP_HOST in .env.local to your DreamHost domain.
        '/api': {
          target: phpHost,
          changeOrigin: true,
        },
      },
    },
  };
});
