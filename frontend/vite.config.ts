/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// The SPA is served behind the Nginx dev proxy at http://localhost:8080.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 8080,
    },
  },
  // Under Vitest, use an inline empty PostCSS config so Vite never resolves
  // postcss.config.js (which requires tailwindcss). This keeps tests runnable
  // in environments where Tailwind isn't installed (e.g. the Docker test image).
  css: process.env.VITEST ? { postcss: { plugins: [] } } : undefined,
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
