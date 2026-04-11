import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const phpHost = env.VITE_PHP_HOST ?? 'http://127.0.0.1:3001';

  return {
    plugins: [react(), tailwindcss()],
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
