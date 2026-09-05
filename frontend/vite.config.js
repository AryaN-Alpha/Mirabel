import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Use injectManifest so we control the SW logic in src/sw.js
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.js",

        // Allow the PWA to be tested during `npm run dev`
        devOptions: {
          enabled: true,
          type: "module",
        },

        // Web App Manifest — what browsers show in the install prompt
        manifest: {
          name: "Mirabel",
          short_name: "Mirabel",
          description:
            "Your personal AI assistant — voice, email, tasks, and more.",
          start_url: "/",
          display: "standalone",
          background_color: "#0d0a1a",
          theme_color: "#7c3aed",
          orientation: "portrait-primary",
          icons: [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
          shortcuts: [
            {
              name: "Home",
              short_name: "Home",
              description: "Go to the Mirabel dashboard",
              url: "/home",
              icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
            },
          ],
          categories: ["productivity", "utilities"],
        },

        // Workbox build options
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        },
      }),
    ],
    server: {
      // Bind to all interfaces so devices on the Tailscale network can reach
      // Vite directly. Without this Vite only listens on 127.0.0.1.
      host: "0.0.0.0",
      port: 5173,
      // Required when host is not localhost — Vite's HMR security check
      // rejects WebSocket upgrade requests whose Host header it doesn't
      // recognise. Adding the Tailscale machine name here prevents HMR
      // from breaking on remote devices.
      allowedHosts: env.VITE_ALLOWED_HOST
        ? ["localhost", "127.0.0.1", env.VITE_ALLOWED_HOST]
        : ["localhost", "127.0.0.1"],
      proxy: {
        // Forward every /api request to Django. Rewriting the Origin header
        // makes Django think the request came from its own origin, so the
        // existing CORS_ALLOWED_ORIGINS list needs no changes for remote
        // devices — they always hit Vite first, never Django directly.
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        // Forward WebSocket connections. ws: true tells Vite to also proxy
        // the WS upgrade handshake. The path /ws/chat/ matches voice/routing.py.
        "/ws": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
