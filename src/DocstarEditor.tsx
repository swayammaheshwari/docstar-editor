import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { connectProvider, type CollabConnection } from "./collab/connectProvider";
import type { DocstarEditorHandle, DocstarEditorProps } from "./types";

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
            collaboration: connection
              ? {
                  provider: connection.provider,
                  fragment: connection.doc.getXmlFragment("default"),
                  user: collab.user,
                }
              : undefined,
          }
        : { initialContent: undefined },
      [connection]
    );

    const initialMarkdownLoaded = useMemo(() => ({ current: false }), [editor]);

    useEffect(() => {
      if (collab) return; // collab documents load their content from the server
      if (initialMarkdownLoaded.current) return;
      if (!defaultMarkdown) return;
      initialMarkdownLoaded.current = true;
      editor.tryParseMarkdownToBlocks(defaultMarkdown).then((blocks) => {
        editor.replaceBlocks(editor.document, blocks);
      });
    }, [collab, defaultMarkdown, editor, initialMarkdownLoaded]);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => editor.blocksToMarkdownLossy(editor.document),
        setMarkdown: async (markdown: string) => {
          const blocks = await editor.tryParseMarkdownToBlocks(markdown);
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

    return (
      <BlockNoteView
        editor={editor}
        editable={editable}
        className={className}
        theme={theme}
        onChange={
          onChange
            ? () => {
                editor.blocksToMarkdownLossy(editor.document).then((markdown) => {
                  onChange(markdown, editor.document);
                });
              }
            : undefined
        }
      />
    );
  }
);
