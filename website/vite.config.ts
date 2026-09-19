import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // GitHub Pages serves this project at /docstar-editor/, not the domain root.
  base: process.env.GITHUB_PAGES ? "/docstar-editor/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "docstar-editor": path.resolve(dirname, "../src/index.ts"),
    },
  },
});
