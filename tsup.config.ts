import { defineConfig } from "tsup";
import { cpSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts"],
  // ESM only: @blocknote/core's CJS build does a raw `require('shiki')`,
  // an ESM-only package, which breaks bundlers (webpack/Next) that resolve
  // the `require` export condition. Consumers must import this as ESM.
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  onSuccess: async () => {
    cpSync("src/styles/editor.css", "dist/styles.css");
  },
});
