import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The SPA is served behind the Nginx dev proxy at http://localhost:8080.
// `host: true` exposes the dev server inside the container; the HMR websocket
// is routed back through the proxy, so the client must connect on port 8080.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 8080,
    },
  },
});
