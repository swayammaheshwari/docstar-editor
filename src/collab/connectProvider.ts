import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { CollabConfig } from "../types";

export interface CollabConnection {
  doc: Y.Doc;
  provider: HocuspocusProvider;
}

/**
 * Opens a Yjs doc synced over a Hocuspocus-compatible WebSocket connection.
 *
 * With `workspaceId` set, `workspaceId`/`documentId` are composed into the
 * Hocuspocus documentName so persistence stays scoped per workspace, hitting
 * `${wsUrl}/workspace/${workspaceId}`, and `token` is forwarded for the
 * server's onAuthenticate hook to verify.
 *
 * Without `workspaceId`, `documentId` is used verbatim as the documentName
 * against `wsUrl` as-is (optionally with `wsParams` appended as query
 * params) — for connecting to a server that doesn't use workspace-scoped
 * routing.
 */
export function connectProvider(config: CollabConfig): CollabConnection {
  const doc = new Y.Doc();

  const wsUrl = toWebSocketUrl(config.wsUrl);
  const url = config.workspaceId
    ? `${wsUrl.replace(/\/$/, "")}/workspace/${config.workspaceId}`
    : appendParams(wsUrl, config.wsParams);

  const provider = new HocuspocusProvider({
    url,
    name: config.workspaceId ? `${config.workspaceId}:${config.documentId}` : config.documentId,
    token: config.token,
    document: doc,
  });

  provider.setAwarenessField("user", config.user);

  return { doc, provider };
}

function appendParams(url: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${new URLSearchParams(params).toString()}`;
}

/**
 * `new WebSocket()` requires a `ws:`/`wss:` scheme and throws a SyntaxError
 * for anything else (e.g. `http:`/`https:`), which HocuspocusProvider doesn't
 * guard against — that throw happens silently inside its connect logic, so
 * the UI is left stuck with no `close`/`synced`/`authenticationFailed` event
 * ever firing. Normalize here so a plain http(s) base URL (as apps commonly
 * configure for their API host) just works.
 */
function toWebSocketUrl(url: string): string {
  if (/^https:\/\//i.test(url)) return url.replace(/^https:\/\//i, "wss://");
  if (/^http:\/\//i.test(url)) return url.replace(/^http:\/\//i, "ws://");
  return url;
}
