# docstar-editor

A minimal, block-based Markdown editor for React, built on [BlockNote](https://www.blocknotejs.org). Works standalone with zero setup, and opts into real-time collaboration + server-side sync when you connect it to a Hocuspocus-compatible server.

## Install

```bash
npm i docstar-editor
```

Import the base styles once in your app:

```ts
import "docstar-editor/styles.css";
```

**Note for bundled apps**: `@blocknote/core` resolves a `prosemirror-view` version that's missing an export it needs. Add this to your own `package.json` to pin a working version for this package's dependency subtree:

```json
"overrides": {
  "docstar-editor": {
    "prosemirror-view": "1.33.9"
  }
}
```

(npm workspaces/pnpm/yarn have their own equivalent — `overrides`/`resolutions` — under the same idea: scope the pin to `docstar-editor`'s own dependency tree, not your whole app.)

## Standalone usage

No login, no server required:

```tsx
import { DocstarEditor } from "docstar-editor";

export function Page() {
  return (
    <DocstarEditor
      defaultMarkdown="# Hello\n\nStart writing..."
      onChange={(markdown) => console.log(markdown)}
    />
  );
}
```

## Real-time collaboration

Connect the editor to your own Hocuspocus-compatible server (see [`doc-rtc`](../doc-rtc) for a reference implementation) for live multi-user sync with persistence:

```tsx
import { DocstarEditor } from "docstar-editor";

export function Page() {
  return (
    <DocstarEditor
      collab={{
        wsUrl: "wss://your-server.example.com",
        token: authToken,
        workspaceId: "workspace-abc",
        documentId: "doc-123",
        user: { name: "Swayam", color: "#5b8def" },
      }}
    />
  );
}
```

When `collab` is provided, the editor connects over WebSocket, syncs edits live via Yjs, and shows collaborator cursors/presence automatically. Omit `workspaceId`/`token` to connect to a server that identifies documents directly by `documentId` instead (see `wsParams` in `CollabConfig`).

## Local development / demo site

See [`website/`](./website) — a small standalone demo app (landing page + Playground/Import) that imports the editor directly from source, no build/pack step needed. It's local-only/single-user by design; it doesn't demonstrate the `collab` prop.

```bash
cd website
npm install
npm run dev
```

The site auto-deploys to GitHub Pages on every push to `main` that touches `website/` or `src/` (see `.github/workflows/deploy-website.yml`). One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Publishing to npm

```bash
# 1. Build and sanity-check what will be published
npm run build
npm pack --dry-run

# 2. Log in (one-time per machine; opens a browser to authenticate)
npm login

# 3. Bump the version (pick one)
npm version patch   # 0.1.0 -> 0.1.1, bug fixes
npm version minor   # 0.1.0 -> 0.2.0, new features
npm version major   # 0.1.0 -> 1.0.0, breaking changes

# 4. Publish
npm publish

# 5. Push the version bump commit + tag that `npm version` created
git push && git push --tags
```

`npm version` refuses to run with uncommitted changes — commit your work first. `npm publish` is public and irreversible (a given version can never be re-published, only deprecated), so double-check `npm pack --dry-run`'s file list before running it.

## License

MIT
