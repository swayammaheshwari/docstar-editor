# Testing docstar-editor changes locally (without publishing)

Two workflows, depending on what you're testing.

## 1. Fastest loop: the built-in website/playground

Use this for anything that doesn't depend on hitman-ui specifically (block
behavior, markdown export, collab against a local doc-rtc, etc). No
packing, no publishing, no reinstalling — just edit and refresh.

```bash
cd docstar-editor
npm run dev          # tsup --watch, rebuilds dist/ on every save

# in a second terminal
cd docstar-editor/website
npm run dev          # vite dev server
```

The website already depends on `docstar-editor` from its own
`node_modules`, but that's a real installed copy, not a live link, so by
default it won't pick up your local changes. Point it at the workspace copy
once with `npm link` (one-time setup, survives across sessions):

```bash
cd docstar-editor
npm link                      # registers this package globally

cd docstar-editor/website
npm link docstar-editor       # symlinks node_modules/docstar-editor -> ../
```

Now: edit `docstar-editor/src/**`, `tsup --watch` rebuilds `dist/`, and
Vite's dev server picks up the change on refresh (you may need to hard
refresh once after linking). No `npm run build` + `npm pack` + reinstall
cycle needed.

To undo the link later: `cd website && npm unlink docstar-editor && npm install`.

(Vite follows symlinks fine here. hitman-ui can't use this same trick — see
below.)

## 2. Testing inside hitman-ui

**`npm link` does not work for this** — hitman-ui runs on Next.js 16 with
Turbopack in dev mode, and Turbopack refuses to resolve a module through a
symlink whose real target lives outside the project's root directory (a
sibling `docstar-editor` checkout, in this case). `experimental.externalDir:
true` in `next.config.js` fixes this for the plain webpack production
build (`npm run build`) but **not** for Turbopack dev (`npm run dev`) — the
`webpack()` config function in `next.config.js` is ignored entirely under
Turbopack. If you try `npm link` here anyway, expect `Module not found:
Can't resolve 'docstar-editor'` in dev mode no matter how many times you
restart or clear `.next`.

Use a real (non-symlinked) local install instead — pack docstar-editor into
a tarball and install *that* into hitman-ui's `node_modules`, same as a
normal dependency, just from a local file instead of the registry:

```bash
cd docstar-editor
npm run build
npm pack --pack-destination /tmp

cd hitman-ui
npm install /tmp/docstar-editor-*.tgz --no-save
```

`--no-save` keeps `package.json` pointing at the real registry version
(e.g. `^0.1.7`) — only `node_modules/docstar-editor` itself gets replaced
with your local build's contents. Nothing to commit, nothing to revert in
`package.json`.

**Every time you change docstar-editor's source, repeat those four
commands** (rebuild, repack, reinstall). There's no watch-mode shortcut
here the way there is for the website, since hitman-ui needs an actual
`node_modules` copy, not a live-reloading symlink. It's still much faster
than a real `npm publish` cycle. Restart hitman-ui's dev server
(`rm -rf .next && npm run dev`) after reinstalling if changes don't show up
— Turbopack can hold onto a stale resolution of the old `node_modules`
contents until restarted.

**When you're done and about to actually ship a fix:** bump
`docstar-editor`'s version, `npm publish` it for real, update
`hitman-ui/package.json`'s version spec to match, and run a normal
`npm install` (no `--no-save`, no tarball) to get the real published copy
back into `node_modules`.

## Notes

- **The global `npm link` registration can go stale** if this repo ever
  moves/gets re-cloned to a different path (it happened once, silently
  pointing at a no-longer-existent `Documents/Development/docstar-editor`).
  Symptom: `npm link docstar-editor` in a consumer fails with `ENOENT ...
  /lib/node_modules/docstar-editor/package.json`. Fix: re-run `npm link`
  from inside the current `docstar-editor` checkout to re-register the
  global link at the correct path.
- **`npm link` doesn't pull in a linked package's own dependencies**
  (`yjs`, `@blocknote/*`, `@hocuspocus/provider`, `react-icons`, etc.) —
  only a real registry/tarball install does that automatically. This
  doesn't come up with the tarball approach above (a tarball install is a
  real install, dependencies included), but matters if you ever do use
  `npm link` somewhere (like the website). Symptom there: "Module not
  found" for one of docstar-editor's own dependencies, even though it's
  sitting right there in `docstar-editor/node_modules`. Fix: install that
  dependency directly into the consumer too, at a matching version.
- hitman-ui's `next.config.js` has an explicit
  `config.resolve.alias['yjs']` pointing at its own `node_modules/yjs`, to
  guard against two separate Yjs instances existing at once (which breaks
  Y.Doc identity checks). That means hitman-ui needs its own real `yjs`
  dependency regardless of how docstar-editor is installed — already the
  case via `package.json`, nothing to do here unless that alias ever
  breaks.
