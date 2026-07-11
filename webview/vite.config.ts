import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(root, "src/main.tsx"),
      output: {
        entryFileNames: "main.js",
        assetFileNames: (asset) => (asset.name?.endsWith(".css") ? "styles.css" : "assets/[name]-[hash][extname]")
      }
    }
  }
});
