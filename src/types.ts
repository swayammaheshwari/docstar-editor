import type { Block } from "@blocknote/core";

export interface CollabUser {
  name: string;
  color: string;
}

export interface CollabConfig {
  /** WebSocket URL of the Hocuspocus-compatible collaboration server, e.g. "wss://editor.docstar.io" */
  wsUrl: string;
  /**
   * Identifies the document. With `workspaceId` set, this is scoped under it
   * (`${workspaceId}:${documentId}`) and hits `${wsUrl}/workspace/${workspaceId}`.
   * Without `workspaceId`, this is used verbatim as the Hocuspocus documentName
   * against `wsUrl` as-is — for connecting to an existing/legacy server that
   * doesn't use the workspace-scoped routing (e.g. `documentName` already
   * equals a raw page id).
   */
  documentId: string;
  /** Auth token issued for the workspace/session, sent to the server's onAuthenticate hook. Only meaningful with `workspaceId`. */
  token?: string;
  /** The workspace this document belongs to. Omit to connect directly to `wsUrl` with `documentId` as the raw documentName. */
  workspaceId?: string;
  /** Extra query params appended to `wsUrl` as-is (e.g. `{ orgId, userId }` for a legacy server). Ignored when `workspaceId` is set. */
  wsParams?: Record<string, string>;
  /** Local user's presence info shown to collaborators. */
  user: CollabUser;
}

export interface DocstarEditorProps {
  /** Initial content as markdown. Ignored once `collab` is set and a document already exists on the server. */
  defaultMarkdown?: string;
  /** Fires on every content change with the current markdown and raw blocks. */
  onChange?: (markdown: string, blocks: Block[]) => void;
  /** Enables real-time collaboration + server-side sync when provided. Omit for local, single-user mode. */
  collab?: CollabConfig;
  /** Optional extra class name for the editor container. */
  className?: string;
  /** Disables editing. */
  editable?: boolean;
  /** Visual theme. Defaults to "light". */
  theme?: "light" | "dark";
  /** Makes the editor's own background transparent, so it blends into whatever container it's placed in instead of showing its own distinct panel color. */
  transparent?: boolean;
}

export interface DocstarEditorHandle {
  /** Serializes the current document to Markdown. */
  getMarkdown: () => Promise<string>;
  /** Replaces the current document with the parsed content of a Markdown string. */
  setMarkdown: (markdown: string) => Promise<void>;
  /** Moves focus into the editor. */
  focus: () => void;
}
