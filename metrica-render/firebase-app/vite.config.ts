import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  publicDir: resolve(__dirname, "../public"),
  server: { fs: { allow: [resolve(__dirname, "..")] } },
  build: { outDir: "dist", emptyOutDir: true },
});
