import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  insertOrUpdateBlock,
  filterSuggestionItems,
} from "@blocknote/core";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { BlockNoteView, lightDefaultTheme, darkDefaultTheme } from "@blocknote/mantine";
import { MdError, MdLink } from "react-icons/md";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { connectProvider, type CollabConnection } from "./collab/connectProvider";
import { Alert } from "./blocks/alert";
import { PageLink } from "./blocks/pageLink";
import { PageLinkSearchContext } from "./blocks/pageLinkContext";
import { codeBlock } from "./blocks/codeBlocks";
import type { DocstarEditorHandle, DocstarEditorProps } from "./types";

// BlockNote's markdown exporter runs every block through `toExternalHTML`
// then a generic HTML->Markdown conversion, which silently unwraps unknown
// custom elements (no "raw HTML passthrough" the way e.g. `marked` does) —
// so an `<alert>`/`<card>` element written there is dropped entirely. To get
// a literal wrapper tag in the output markdown, replace each such block with
// a plain paragraph whose inline text content already contains the literal
// wrapper tags before serializing — paragraph text content is emitted
// verbatim, unlike custom block HTML. Must match doc-rtc's server-side
// `wrapCustomBlocksForMarkdown` exactly, since both write the same on-disk
// format.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapCustomBlocksForMarkdown = (blocks: readonly any[]): any[] =>
  blocks.map((block) => {
    const children = block.children?.length ? wrapCustomBlocksForMarkdown(block.children) : block.children;
    if (block.type === "alert") {
      return {
        ...block,
        type: "paragraph",
        props: {},
        children,
        content: [
          { type: "text", text: `<alert type="${block.props?.type ?? "warning"}">`, styles: {} },
          ...(Array.isArray(block.content) ? block.content : []),
          { type: "text", text: "</alert>", styles: {} },
        ],
      };
    }
    if (block.type === "pageLink") {
      const { pageId, title, image } = block.props ?? {};
      const imgTag = image ? `<img src="${image}"/>` : "";
      return {
        ...block,
        type: "paragraph",
        props: {},
        children,
        content: [
          { type: "text", text: `<card href="${pageId ?? ""}">${imgTag}${title ?? ""}</card>`, styles: {} },
        ],
      };
    }
    return children === block.children ? block : { ...block, children };
  });

// `wrapCustomBlocksForMarkdown` above is export-only — there's no matching
// reverse direction. BlockNote's public block-spec API (as of 0.42.x) has no
// `parseHTML`/markdown-import hook a custom block can register (only
// `toExternalHTML`, used for non-markdown HTML export/copy-paste), and
// `tryParseMarkdownToBlocks` is a generic, non-extensible markdown->blocks
// conversion. So without this, loading exported markdown back in (via
// `defaultMarkdown`/`setMarkdown`) hits BlockNote's own generic importer,
// which recognizes the bare `<img>` inside our `<card>` text and silently
// promotes it to one of BlockNote's own native image blocks (hence the
// `"BlockNote image"` alt text — that's BlockNote's own default, not
// anything we wrote), dropping the `<card>`/`<alert>` wrapper entirely.
//
// Fix: reverse the trick manually, token-based (same approach the hitman-api
// migration script uses for embeds/cards) — swap each literal `<card>`/
// `<alert>` paragraph for an inert placeholder BEFORE handing the markdown to
// BlockNote's parser, then walk the resulting blocks and splice a real
// `pageLink`/`alert` block back in wherever a placeholder landed.
const CARD_LINE_REGEX = /^<card href="([^"]*)">(?:<img src="([^"]*)"\/>)?([\s\S]*?)<\/card>$/;
const ALERT_LINE_REGEX = /^<alert type="([^"]*)">([\s\S]*?)<\/alert>$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CustomBlockToken =
  | { type: "pageLink"; pageId: string; image: string; title: string }
  | { type: "alert"; alertType: string; inner: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrapCustomBlocksFromMarkdown = (markdown: string, editor: any): any[] => {
  const tokens = new Map<string, CustomBlockToken>();
  let tokenIndex = 0;

  // Punctuation-free for the same reason the hitman-api converter's tokens
  // are: a markdown serializer could otherwise escape characters inside the
  // token (e.g. underscores), breaking the later exact-text match below.
  const nextToken = () => `DOCSTARIMPORTTOKEN${tokenIndex++}ENDTOKEN`;

  // Our exporter always writes each `<card>`/`<alert>` as its own standalone
  // paragraph, separated by blank lines — split the same way to find them.
  const segments = markdown.split(/\n\n+/);
  const rewritten = segments.map((segment) => {
    const trimmed = segment.trim();

    const cardMatch = trimmed.match(CARD_LINE_REGEX);
    if (cardMatch) {
      const token = nextToken();
      tokens.set(token, { type: "pageLink", pageId: cardMatch[1] ?? "", image: cardMatch[2] ?? "", title: (cardMatch[3] ?? "").trim() });
      return token;
    }

    const alertMatch = trimmed.match(ALERT_LINE_REGEX);
    if (alertMatch) {
      const token = nextToken();
      tokens.set(token, { type: "alert", alertType: alertMatch[1] ?? "warning", inner: alertMatch[2] ?? "" });
      return token;
    }

    return segment;
  });

  const blocks = editor.tryParseMarkdownToBlocks(rewritten.join("\n\n"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blockPlainText = (block: any): string =>
    Array.isArray(block.content)
      ? block.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("").trim()
      : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return blocks.map((block: any) => {
    const token = tokens.get(blockPlainText(block));
    if (!token) return block;

    if (token.type === "pageLink") {
      return { type: "pageLink", props: { pageId: token.pageId, title: token.title, image: token.image } };
    }

    // The alert's inner text can carry rich inline formatting (the exporter
    // writes the block's original inline-content array back out with
    // markdown styling, e.g. `**bold**`) — re-parse it with BlockNote's own
    // markdown parser rather than reinventing inline-markdown parsing, and
    // lift the resulting inline content straight into the alert block.
    const innerBlocks = editor.tryParseMarkdownToBlocks(token.inner.trim());
    const content = innerBlocks[0]?.content ?? [];
    return { type: "alert", props: { type: token.alertType }, content };
  });
};

// `defaultBlockSpecs.codeBlock` is built via `createCodeBlockSpec()` with no
// options — its language-picker <select> only renders when
// `supportedLanguages` is populated, so out of the box the code block has no
// language selection at all. Override it here with an explicit list.
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock,
    alert: Alert(),
    pageLink: PageLink(),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insertAlert = (editor: any) => ({
  title: "Alert",
  subtext: "Highlight important information",
  onItemClick: () =>
    insertOrUpdateBlock(editor, { type: "alert" as const }),
  aliases: ["alert", "notice", "warning", "error", "info", "success"],
  group: "Basic blocks",
  icon: <MdError size={18} />,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insertPageLink = (editor: any) => ({
  title: "Link to Page",
  subtext: "Insert a card linking to another page",
  onItemClick: () =>
    insertOrUpdateBlock(editor, { type: "pageLink" as const }),
  aliases: ["page", "link", "card", "pagelink"],
  group: "Basic blocks",
  icon: <MdLink size={18} />,
});

const transparentLightTheme = {
  ...lightDefaultTheme,
  colors: { ...lightDefaultTheme.colors, editor: { ...lightDefaultTheme.colors.editor, background: "transparent" } },
};
const transparentDarkTheme = {
  ...darkDefaultTheme,
  colors: { ...darkDefaultTheme.colors, editor: { ...darkDefaultTheme.colors.editor, background: "transparent" } },
};

type CollabStatus = "connecting" | "synced" | "error";

export const DocstarEditor = forwardRef<DocstarEditorHandle, DocstarEditorProps>(
  function DocstarEditor(
    {
      defaultMarkdown,
      onChange,
      collab,
      className,
      editable = true,
      theme = "light",
      transparent = false,
      uploadFile,
      onSearchPages,
    },
    ref
  ) {
    const [connection, setConnection] = useState<CollabConnection | null>(null);
    const [status, setStatus] = useState<CollabStatus>("connecting");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!collab) return;
      setStatus("connecting");
      setError(null);
      const conn = connectProvider(collab);
      setConnection(conn);

      const onSynced = () => setStatus("synced");
      const onAuthenticationFailed = ({ reason }: { reason: string }) => {
        setStatus("error");
        setError(`Authentication failed: ${reason}`);
      };
      const onClose = ({ event }: { event: { code: number; reason: string } }) => {
        setStatus((current) => {
          if (current === "synced") return current;
          setError(`Connection closed (${event.code}) ${event.reason}`.trim());
          return "error";
        });
      };

      conn.provider.on("synced", onSynced);
      conn.provider.on("authenticationFailed", onAuthenticationFailed);
      conn.provider.on("close", onClose);

      // Safety net: if the underlying transport fails in a way that never
      // fires synced/authenticationFailed/close (e.g. an invalid WS URL
      // throwing inside the provider's connect logic), don't hang on
      // "Connecting…" forever.
      const timeout = setTimeout(() => {
        setStatus((current) => {
          if (current !== "connecting") return current;
          setError("Timed out waiting for the server to respond.");
          return "error";
        });
      }, 15000);

      return () => {
        clearTimeout(timeout);
        conn.provider.off("synced", onSynced);
        conn.provider.off("authenticationFailed", onAuthenticationFailed);
        conn.provider.off("close", onClose);
        conn.provider.destroy();
        conn.doc.destroy();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collab?.wsUrl, collab?.documentId, collab?.token]);

    const editor = useCreateBlockNote(
      collab
        ? {
            schema,
            collaboration: connection
              ? {
                  provider: connection.provider,
                  fragment: connection.doc.getXmlFragment("default"),
                  user: collab.user,
                }
              : undefined,
            uploadFile,
          }
        : { schema, initialContent: undefined, uploadFile },
      [connection, uploadFile]
    );

    const initialMarkdownLoaded = useMemo(() => ({ current: false }), [editor]);

    useEffect(() => {
      if (collab) return; // collab documents load their content from the server
      if (initialMarkdownLoaded.current) return;
      if (!defaultMarkdown) return;
      initialMarkdownLoaded.current = true;
      const blocks = unwrapCustomBlocksFromMarkdown(defaultMarkdown, editor);
      editor.replaceBlocks(editor.document, blocks);
    }, [collab, defaultMarkdown, editor, initialMarkdownLoaded]);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () =>
          Promise.resolve(editor.blocksToMarkdownLossy(wrapCustomBlocksForMarkdown(editor.document))),
        setMarkdown: async (markdown: string) => {
          const blocks = unwrapCustomBlocksFromMarkdown(markdown, editor);
          editor.replaceBlocks(editor.document, blocks);
        },
        focus: () => editor.focus(),
      }),
      [editor]
    );

    // Always include "docstar-editor" as a base class, merged with whatever
    // the caller passes — this package's own CSS (editor.css) targets
    // `.docstar-editor` as an anchor selector (e.g. `.docstar-editor
    // .bn-editor` to override BlockNote's own padding). Relying on the
    // caller to pass that exact class name themselves is fragile: a caller
    // that omits `className` (or passes something else) would silently get
    // none of this package's own styling with no visible error.
    const rootClassName = className ? `docstar-editor ${className}` : "docstar-editor";

    if (collab && status === "connecting") {
      return (
        <div className={rootClassName} data-docstar-status="connecting">
          <div className="docstar-skeleton">
            <div className="docstar-skeleton-line docstar-skeleton-heading" />
            <div className="docstar-skeleton-line" />
            <div className="docstar-skeleton-line" />
            <div className="docstar-skeleton-line docstar-skeleton-short" />
          </div>
        </div>
      );
    }

    if (collab && status === "error") {
      return (
        <div className={rootClassName} data-docstar-status="error">
          Couldn't connect to the collaboration server{error ? `: ${error}` : "."}
          {" "}Changes won't be saved until this reconnects.
        </div>
      );
    }

    const resolvedTheme = transparent
      ? theme === "dark"
        ? transparentDarkTheme
        : transparentLightTheme
      : theme;

    return (
      <PageLinkSearchContext.Provider value={onSearchPages}>
        <BlockNoteView
          editor={editor}
          editable={editable}
          className={rootClassName}
          theme={resolvedTheme}
          slashMenu={false}
          onChange={
            onChange
              ? () => {
                  const markdown = editor.blocksToMarkdownLossy(wrapCustomBlocksForMarkdown(editor.document));
                  onChange(markdown, editor.document);
                }
              : undefined
          }
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => {
              const items = [...getDefaultReactSlashMenuItems(editor), insertAlert(editor), insertPageLink(editor)];
              return filterSuggestionItems(items, query);
            }}
          />
        </BlockNoteView>
      </PageLinkSearchContext.Provider>
    );
  }
);
