export interface CollabUser {
  name: string;
  color: string;
}

export interface CollabConfig {
  /** WebSocket URL of the Hocuspocus-compatible collaboration server, e.g. "wss://editor.docstar.io" */
  wsUrl: string;
  /**
   * The Hocuspocus documentName, used verbatim — never prefixed or otherwise
   * scoped by this library. If you want per-workspace document naming,
   * compose that yourself, e.g. `documentId: \`${workspaceId}:${yourId}\``.
   */
  documentId: string;
  /** Auth token issued for the workspace/session, sent to the server's onAuthenticate hook. Only meaningful with `workspaceId`. */
  token?: string;
  /** When set, connects to `${wsUrl}/workspace/${workspaceId}` instead of `wsUrl` directly, for servers with workspace-scoped auth routing. */
  workspaceId?: string;
  /** Extra query params appended to the connection URL (e.g. `{ orgId, userId }` for a server that also wants legacy identifying params alongside workspace auth). */
  wsParams?: Record<string, string>;
  /** Local user's presence info shown to collaborators. */
  user: CollabUser;
}

export interface DocstarEditorProps {
  /** Initial content as markdown. Ignored once `collab` is set and a document already exists on the server. */
  defaultMarkdown?: string;
  /** Fires on every content change with the current markdown and raw blocks. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (markdown: string, blocks: any[]) => void;
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
  /**
   * Called when a user pastes, drops, or selects a file (e.g. an image) into
   * the editor. Should upload it and resolve to the URL to embed. If
   * omitted, file/image upload is disabled (BlockNote's default behavior).
   */
  uploadFile?: (file: File) => Promise<string>;
  /**
   * Called to search for pages the user can insert a "Link to Page" card
   * for, as the user types in the card's page picker. Should resolve to the
   * matching pages (empty query = suggest a default/recent list). If
   * omitted, the "Link to Page" card can still be inserted but its picker
   * shows no results.
   */
  onSearchPages?: (query: string) => Promise<{ id: string; title: string; image?: string }[]>;
}

export interface DocstarEditorHandle {
  /** Serializes the current document to Markdown. */
  getMarkdown: () => Promise<string>;
  /** Replaces the current document with the parsed content of a Markdown string. */
  setMarkdown: (markdown: string) => Promise<void>;
  /** Moves focus into the editor. */
  focus: () => void;
}
