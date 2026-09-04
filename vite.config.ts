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
