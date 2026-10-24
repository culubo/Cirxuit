import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@model": new URL("src/model", import.meta.url).pathname,
      "@store": new URL("src/store", import.meta.url).pathname,
      "@scene": new URL("src/scene", import.meta.url).pathname,
      "@ui": new URL("src/ui", import.meta.url).pathname,
      "@solver": new URL("src/solver", import.meta.url).pathname,
      "@runtime": new URL("src/runtime", import.meta.url).pathname,
    },
  },
  worker: {
    format: "es",
  },
  // Pre-bundle the editor and parser at server start. Without this, the first
  // page that opens the editor makes Vite discover them, re-optimize, and reload
  // the page mid-session (which also flakes e2e runs on a cold cache).
  optimizeDeps: {
    // WASM packages locate their binaries via import.meta.url; keep them unbundled.
    exclude: ["@mujoco/mujoco", "onnxruntime-web"],
    include: [
      "codemirror",
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/lang-javascript",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/highlight",
      "acorn",
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["src/import/**"],
  },
});
