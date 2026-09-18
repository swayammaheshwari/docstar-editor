# docstar-editor

A minimal, block-based Markdown editor for React, built on [BlockNote](https://www.blocknotejs.org). Works standalone with zero setup, and opts into real-time collaboration + server-side sync when you're ready.

## Install

```bash
npm i docstar-editor
```

Import the base styles once in your app:

```ts
import "docstar-editor/styles.css";
```

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

Sign in at `editor.docstar.io`, create a workspace, and connect your editor to it for live multi-user sync with persistence:

```tsx
import { DocstarEditor } from "docstar-editor";

export function Page() {
  return (
    <DocstarEditor
      collab={{
        wsUrl: "wss://editor.docstar.io",
        token: authToken,
        workspaceId: "workspace-abc",
        documentId: "doc-123",
        user: { name: "Swayam", color: "#5b8def" },
      }}
    />
  );
}
```

When `collab` is provided, the editor connects over WebSocket to a Hocuspocus-compatible server (self-hosted or `editor.docstar.io`), syncs edits live via Yjs, and shows collaborator cursors/presence automatically.

## Local testing

See [`playground/`](./playground) for a small local test app that imports the editor directly from source — no build/pack step needed. It asks for a page ID, then opens the editor synced in real time to a Hocuspocus document with that ID on `doc-rtc`.

## License

MIT
