import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
const base = runtime.process?.env?.["APP_BASE_PATH"] || "/";

export default defineConfig({
  root: "src/frontend",
  base,
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api/shuffle": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/api/solve": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/api/progress": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/api/cancel": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/api/challenge-board": { target: "http://127.0.0.1:8001", changeOrigin: true },
    },
  },
});
