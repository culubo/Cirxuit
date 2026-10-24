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
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["src/import/**"],
  },
});
