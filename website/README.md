# docstar-editor website

A static demo site for the `docstar-editor` package — a landing page plus a
live, standalone editor (Playground + Import). Depends on the real published
`docstar-editor` npm package, the same way any consumer would.

This site is intentionally local-only/single-user: nothing here is synced to
a server or persisted anywhere. Use Export to save your work as a Markdown
file. Real-time collaboration is a feature of the `docstar-editor` package
itself (via the `collab` prop) — this demo just doesn't wire up a server.

## Run

```bash
npm install
npm run dev
```

### Iterating on the package itself

To point this site at the local, unpublished `../src` instead of the
published npm package (e.g. while developing a new `docstar-editor` feature),
first `npm install` in the repo root so its own dependencies exist, then:

```bash
LOCAL_DOCSTAR_EDITOR=true npm run dev
```

Never build/deploy with `LOCAL_DOCSTAR_EDITOR` set — CI only installs
`website/`'s own dependencies, and resolving to `../src` needs the root
package's `node_modules` too.

## Build

```bash
npm run build
```

Outputs a static site to `dist/` — deployable anywhere that serves static
files (GitHub Pages, Vercel, Netlify, etc.). See the root
[`docstar-editor` README](../README.md) for the GitHub Pages deploy workflow.
