# docstar-editor website

A static demo site for the `docstar-editor` package — a landing page plus a
live, standalone editor (Playground + Import). Imports the package directly
from `../src` (no build/pack step needed to try local changes).

This site is intentionally local-only/single-user: nothing here is synced to
a server or persisted anywhere. Use Export to save your work as a Markdown
file. Real-time collaboration is a feature of the `docstar-editor` package
itself (via the `collab` prop) — this demo just doesn't wire up a server.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Outputs a static site to `dist/` — deployable anywhere that serves static
files (GitHub Pages, Vercel, Netlify, etc.). See the root
[`docstar-editor` README](../README.md) for the GitHub Pages deploy workflow.
