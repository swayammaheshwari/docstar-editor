# docstar-editor playground

A local test harness for the `docstar-editor` package, importing directly from `../src` (no build/pack step needed — just save and reload).

## Run

```bash
npm install
npm run dev
```

## Flow

1. You're asked to enter a **page ID**.
2. Submitting it opens the editor connected in real time to a Hocuspocus document on `doc-rtc`, scoped as `${workspaceId}:${pageId}`.

Real-time **multi-user collaboration** (presence/cursors) isn't wired up yet — this just verifies the editor stays in sync with the server for a single connection.

## Configuration

Copy `.env.example` to `.env` and adjust if needed:

```bash
cp .env.example .env
```

| Var                    | Default                 | Notes                                                    |
| ---------------------- | ------------------------ | --------------------------------------------------------- |
| `VITE_DOCRTC_WS_URL`   | `ws://localhost:1234`   | doc-rtc's WS server                                       |
| `VITE_WORKSPACE_TOKEN` | `dev-token`              | Must match `WORKSPACE_AUTH_TOKEN` in doc-rtc's env         |
| `VITE_WORKSPACE_ID`    | `playground`             | Any string — just scopes storage per workspace            |

## Requirements

`doc-rtc` must be running locally with `WORKSPACE_AUTH_TOKEN` set to the same value as `VITE_WORKSPACE_TOKEN` above, plus its own Postgres/Redis configured (see `doc-rtc/README.md`). Point `doc-rtc`'s env at your own local/dev database — don't reuse shared or production credentials for playground testing.
