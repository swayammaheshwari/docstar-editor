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
    alias: process.env.LOCAL_DOCSTAR_EDITOR
      ? {
          // Opt-in only (`LOCAL_DOCSTAR_EDITOR=true npm run dev`), for iterating on
          // the package itself. Resolving here means Node/Rollup look for
          // @blocknote/* etc. by walking UP from ../src, i.e. in the root
          // docstar-editor/node_modules — NOT website/node_modules — so this
          // only works when the root package's own deps are installed too, and
          // must never be the default for builds (CI only installs website/).
          "docstar-editor": path.resolve(dirname, "../src/index.ts"),
        }
      : undefined,
  },
});
