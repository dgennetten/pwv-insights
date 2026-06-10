import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { router } from "./router";
import { AuthProvider } from "./contexts/AuthContext";
import { getStoredTheme, applyTheme } from "./lib/theme";
import "@fontsource-variable/inter/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./index.css";

// Precache the app shell so all routes (esp. /data-logger) open offline.
registerSW({ immediate: true });

// Ask the browser not to evict IndexedDB (offline patrol logs) under storage
// pressure. Granted silently for installed PWAs; harmless if denied.
if (navigator.storage?.persist) void navigator.storage.persist();

// Apply theme before first render to avoid flash
applyTheme(getStoredTheme());

// Re-apply when OS preference changes while in system mode
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (getStoredTheme() === "system") applyTheme("system");
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
