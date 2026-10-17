import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local-only build: no CDN assets, fonts or analytics. Output is served by the loopback API.
export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  build: {
    outDir: new URL("../dist/web", import.meta.url).pathname,
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
});
