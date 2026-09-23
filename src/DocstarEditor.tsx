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
      const blocks = editor.tryParseMarkdownToBlocks(defaultMarkdown);
      editor.replaceBlocks(editor.document, blocks);
    }, [collab, defaultMarkdown, editor, initialMarkdownLoaded]);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () =>
          Promise.resolve(editor.blocksToMarkdownLossy(wrapCustomBlocksForMarkdown(editor.document))),
        setMarkdown: async (markdown: string) => {
          const blocks = editor.tryParseMarkdownToBlocks(markdown);
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
