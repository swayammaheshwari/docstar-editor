import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { insertOrUpdateBlockForSlashMenu, filterSuggestionItems } from "@blocknote/core/extensions";
import { withCollaboration } from "@blocknote/core/yjs";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { BlockNoteView, lightDefaultTheme, darkDefaultTheme } from "@blocknote/mantine";
import { MdError } from "react-icons/md";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { connectProvider, type CollabConnection } from "./collab/connectProvider";
import { Alert } from "./blocks/alert";
import type { DocstarEditorHandle, DocstarEditorProps } from "./types";

// BlockNote's markdown exporter runs every block through `toExternalHTML`
// then a generic HTML->Markdown conversion, which silently unwraps unknown
// custom elements (no "raw HTML passthrough" the way e.g. `marked` does) —
// so a `<alert>` element written there is dropped entirely. To get a
// literal `<alert>...</alert>` wrapper in the output markdown, replace
// each alert block with a plain paragraph whose inline text content
// already contains the literal wrapper tags before serializing — paragraph
// text content is emitted verbatim, unlike custom block HTML. Must match
// doc-rtc's server-side `wrapAlertBlocksForMarkdown` exactly, since both
// write the same on-disk format.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapAlertBlocksForMarkdown = (blocks: readonly any[]): any[] =>
  blocks.map((block) => {
    const children = block.children?.length ? wrapAlertBlocksForMarkdown(block.children) : block.children;
    if (block.type !== "alert") {
      return children === block.children ? block : { ...block, children };
    }
    return {
      ...block,
      type: "paragraph",
      props: {},
      children,
      content: [
        { type: "text", text: "<alert>", styles: {} },
        ...(Array.isArray(block.content) ? block.content : []),
        { type: "text", text: "</alert>", styles: {} },
      ],
    };
  });

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    alert: Alert(),
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insertAlert = (editor: any) => ({
  title: "Alert",
  subtext: "Highlight important information",
  onItemClick: () =>
    insertOrUpdateBlockForSlashMenu(editor, { type: "alert" as const }),
  aliases: ["alert", "notice", "warning", "error", "info", "success"],
  group: "Basic blocks",
  icon: <MdError size={18} />,
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
      collab && connection
        ? withCollaboration({
            schema,
            uploadFile,
            collaboration: {
              provider: { awareness: connection.provider.awareness ?? undefined },
              fragment: connection.doc.getXmlFragment("default"),
              user: { name: collab.user.name, color: collab.user.color },
            },
          })
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
          Promise.resolve(editor.blocksToMarkdownLossy(wrapAlertBlocksForMarkdown(editor.document))),
        setMarkdown: async (markdown: string) => {
          const blocks = editor.tryParseMarkdownToBlocks(markdown);
          editor.replaceBlocks(editor.document, blocks);
        },
        focus: () => editor.focus(),
      }),
      [editor]
    );

    if (collab && status === "connecting") {
      return (
        <div className={className} data-docstar-status="connecting">
          Connecting…
        </div>
      );
    }

    if (collab && status === "error") {
      return (
        <div className={className} data-docstar-status="error">
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
      <BlockNoteView
        editor={editor}
        editable={editable}
        className={className}
        theme={resolvedTheme}
        slashMenu={false}
        onChange={
          onChange
            ? () => {
                const markdown = editor.blocksToMarkdownLossy(wrapAlertBlocksForMarkdown(editor.document));
                onChange(markdown, editor.document);
              }
            : undefined
        }
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => {
            const items = [...getDefaultReactSlashMenuItems(editor), insertAlert(editor)];
            return filterSuggestionItems(items, query);
          }}
        />
      </BlockNoteView>
    );
  }
);
