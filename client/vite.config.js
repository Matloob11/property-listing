import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root,
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 8192,
  },
});
