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
import { markdownToBlocksPreservingCustomBlocks } from "./markdown/customBlocks";
import { installSafeProsemirrorView } from "./editor/safeProsemirrorView";
import { Alert } from "./blocks/alert";
import { PageLink } from "./blocks/pageLink";
import { PageLinkOpenContext, PageLinkSearchContext } from "./blocks/pageLinkContext";
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
const isEmptyInlineContent = (content: any): boolean =>
  !Array.isArray(content) || content.length === 0 || content.every((node) => node?.type === "text" && !(node.text || "").trim());

// `textColor`/`backgroundColor`/`underline` text styles have no CommonMark
// representation at all (unlike bold/italic/strikethrough/code, which
// export via native `**`/`_`/`~~`/`` ` `` syntax) — BlockNote's own export
// pipeline drops them completely (confirmed: a styled run round-trips as
// indistinguishable plain text) and even has a dedicated rehype plugin
// (`removeUnderlinesRehypePlugin`) whose entire job is stripping `<u>`
// before markdown conversion. Same "literal wrapper tag" technique as
// alert/pageLink, but at the inline-content level instead of the block
// level: `<span data-text-color="red" data-background-color="red">`/`<u>`
// are both standard tags `marked` passes through untouched, and reusing
// BlockNote's own `data-text-color`/`data-background-color` attribute
// names means the public CSS can mirror its `[data-text-color="red"] {
// color: #e03e3e }`-style rules directly instead of inventing new ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapStyledInlineContent = (content: any): any => {
  if (!Array.isArray(content)) return content;
  let changed = false;
  const wrapped = content.map((node) => {
    if (node?.type !== "text") return node;
    const { textColor, backgroundColor, underline, ...restStyles } = node.styles ?? {};
    if (!textColor && !backgroundColor && !underline) return node;
    changed = true;
    let text = node.text;
    if (underline) text = `<u>${text}</u>`;
    if (textColor || backgroundColor) {
      const attrs = [textColor && `data-text-color="${textColor}"`, backgroundColor && `data-background-color="${backgroundColor}"`].filter(Boolean).join(" ");
      text = `<span ${attrs}>${text}</span>`;
    }
    return { ...node, styles: restStyles, text };
  });
  return changed ? wrapped : content;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrapCustomBlocksForMarkdown = (blocks: readonly any[]): any[] =>
  blocks.map((block) => {
    const children = block.children?.length ? wrapCustomBlocksForMarkdown(block.children) : block.children;
    const content = wrapStyledInlineContent(block.content);
    if (block.type === "alert") {
      return {
        ...block,
        type: "paragraph",
        props: {},
        children,
        content: [
          { type: "text", text: `<alert type="${block.props?.type ?? "warning"}">`, styles: {} },
          ...(Array.isArray(content) ? content : []),
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
    if (block.type === "toggleListItem") {
      // BlockNote's own external-HTML exporter degrades `toggleListItem`
      // badly (groups it into a plain <ul>, and — since only list-item block
      // types preserve nesting there — un-nests its `children` into flat
      // sibling blocks with no marker of where the collapsible body starts
      // or ends). Emit an explicit `<toggle-end>` marker block after the
      // (recursively wrapped) children so the flattened body region stays
      // recoverable, paired to its `<toggle-summary>` by `block.id` (unique
      // per block) rather than by proximity — proximity alone breaks for a
      // toggle nested inside another toggle's body, since the inner pair's
      // markers appear before the outer's in the flattened sequence.
      const toggleEndMarker = {
        id: `${block.id}-toggle-end`,
        type: "paragraph",
        props: {},
        children: [],
        content: [{ type: "text", text: `<toggle-end data-toggle-id="${block.id}"></toggle-end>`, styles: {} }],
      };
      return {
        ...block,
        type: "paragraph",
        props: {},
        children: [...(Array.isArray(children) ? children : []), toggleEndMarker],
        content: [
          { type: "text", text: `<toggle-summary data-toggle-id="${block.id}">`, styles: {} },
          ...(Array.isArray(content) ? content : []),
          { type: "text", text: "</toggle-summary>", styles: {} },
        ],
      };
    }
    if (block.type === "video" || block.type === "audio") {
      // BlockNote's own markdown pipeline mangles both of these before we
      // ever get a chance to intercept them: a `video` block's
      // `toExternalHTML` emits a real `<video src>` element, which a
      // dedicated rehype step (`convertVideoToMarkdownRehypePlugin`)
      // rewrites into image syntax `![](url)` *before* markdown
      // conversion — round-tripping to a broken `<img>` publicly, since a
      // video file isn't a valid image source. An `audio` block's
      // `toExternalHTML` emits a bare `<audio src>` with no text content,
      // which hast-util-to-mdast's shared media handler falls back to
      // "link to the resource" for, producing a markdown link with a
      // *empty* label (`[](url)`) — an invisible, blank-looking link
      // publicly. Neither ever reaches this function's block.type checks
      // as literal HTML the way alert/pageLink do, because the mangling
      // happens one layer deeper (in the HTML step this function's output
      // still has to pass through), so — unlike alert/pageLink — this has
      // to preempt that mangling by never producing a real <video>/<audio>
      // element in the first place, going straight to a literal wrapper
      // tag carrying the raw props instead.
      const { url, name, caption } = block.props ?? {};
      const tag = block.type === "video" ? "video-embed" : "audio-embed";
      return {
        ...block,
        type: "paragraph",
        props: {},
        children,
        content: [
          { type: "text", text: `<${tag} src="${url ?? ""}" data-name="${name ?? ""}" data-caption="${caption ?? ""}"></${tag}>`, styles: {} },
        ],
      };
    }
    if (block.type === "image" && block.props?.previewWidth) {
      // A manually-resized image (dragging BlockNote's resize handle sets
      // `previewWidth`) exports as plain `![alt](src)` — CommonMark image
      // syntax has no way to encode a width, so it's silently dropped,
      // and the public page falls back to the image's full intrinsic
      // size. `toExternalHTML` does put the width onto the exported
      // `<img>` element (@blocknote/core's Image/block.ts), but that's
      // lost in the same HTML->Markdown step, same root cause as video/
      // audio above. Only wrapped when actually resized — an image at
      // its default size keeps exporting via the plain, already-working
      // `![alt](src)` syntax untouched.
      const { url, name, previewWidth } = block.props ?? {};
      return {
        ...block,
        type: "paragraph",
        props: {},
        children,
        content: [{ type: "text", text: `<img src="${url ?? ""}" alt="${name ?? ""}" width="${previewWidth}"/>`, styles: {} }],
      };
    }
    if (block.type === "paragraph" && isEmptyInlineContent(content)) {
      // A genuinely empty paragraph (an author pressing Enter twice for a
      // blank-line spacer) is silently dropped entirely by
      // `blocksToMarkdownLossy` — not malformed, just gone, since markdown
      // has no way to represent "an empty paragraph" distinct from "no
      // paragraph at all." Giving it a single NBSP character survives the
      // round-trip as an ordinary (if whitespace-only) paragraph.
      return {
        ...block,
        children,
        content: [{ type: "text", text: " ", styles: {} }],
      };
    }
    return children === block.children && content === block.content ? block : { ...block, children, content };
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

// `editor.prosemirrorView` is a getter for tiptap's view *proxy*, which is
// always truthy but throws on any property access once the view is gone
// ("[tiptap error]: The editor view is not available. Cannot access
// view['dom']"). BlockNote's own `?.` guards around it therefore don't guard
// anything, so anything that reaches the editor asynchronously has to check
// first. Parsing markdown is async (it finishes through
// `tryParseHTMLToBlocks`), so an editor that unmounts or is remounted under a
// new React `key` while a parse is in flight — exactly what
// `ChangelogTabContent.clearEditorContent` does, calling `setMarkdown('')` and
// then changing the editor's key in the same handler — would otherwise have
// `replaceBlocks` dispatch into a destroyed view.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isEditorViewAlive = (editor: any): boolean => {
  try {
    return !!editor?.prosemirrorView?.dom?.isConnected;
  } catch {
    return false;
  }
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
      onOpenPage,
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

    // Runs during render, before any BlockNoteView child can read the view.
    useMemo(() => installSafeProsemirrorView(editor), [editor]);

    const initialMarkdownLoaded = useMemo(() => ({ current: false }), [editor]);

    // `markdownToBlocksPreservingCustomBlocks` replaces BlockNote's
    // `tryParseMarkdownToBlocks` on every import path. The built-in parser
    // strips the literal wrapper tags `wrapCustomBlocksForMarkdown` writes
    // (its remark pipeline discards raw HTML), so a `pageLink`/`alert`/toggle/
    // video/audio block came back as a plain paragraph — the reason a
    // page-link card silently turned into text on reload. It's async, unlike
    // the synchronous built-in, because it finishes through
    // `tryParseHTMLToBlocks`.
    useEffect(() => {
      if (collab) return; // collab documents load their content from the server
      if (initialMarkdownLoaded.current) return;
      if (!defaultMarkdown) return;
      initialMarkdownLoaded.current = true;
      let cancelled = false;
      markdownToBlocksPreservingCustomBlocks(defaultMarkdown, (html) =>
        editor.tryParseHTMLToBlocks(html)
      ).then((blocks) => {
        if (cancelled || !isEditorViewAlive(editor)) return;
        editor.replaceBlocks(editor.document, blocks);
      });
      return () => {
        cancelled = true;
      };
    }, [collab, defaultMarkdown, editor, initialMarkdownLoaded]);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () =>
          Promise.resolve(editor.blocksToMarkdownLossy(wrapCustomBlocksForMarkdown(editor.document))),
        setMarkdown: async (markdown: string) => {
          const blocks = await markdownToBlocksPreservingCustomBlocks(markdown, (html) =>
            editor.tryParseHTMLToBlocks(html)
          );
          if (!isEditorViewAlive(editor)) return;
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
        <PageLinkOpenContext.Provider value={onOpenPage}>
        <BlockNoteView
          editor={editor}
          editable={editable}
          className={rootClassName}
          theme={resolvedTheme}
          // BlockNoteView only forwards a *string* theme to Mantine's
          // `data-mantine-color-scheme`; with the theme object `transparent`
          // needs, it falls back to the system/context color scheme instead,
          // which can disagree with the theme the host actually asked for.
          // This carries the caller's own choice through verbatim for
          // editor.css to key its accent color off.
          data-docstar-theme={theme}
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
              // BlockNote renders one section per `group` and keys each
              // section by the group name, so a group that appears in two
              // non-adjacent runs yields duplicate React keys ("Encountered
              // two children with the same key, `Basic blocks`") and React
              // may drop or duplicate one of them. Both custom items above
              // join "Basic blocks", which the default items already opened
              // and closed, so regroup into contiguous runs — keeping each
              // group in the position it first appeared — before filtering.
              const order: string[] = [];
              const byGroup = new Map<string, typeof items>();
              for (const item of items) {
                const group = item.group ?? "";
                if (!byGroup.has(group)) {
                  byGroup.set(group, []);
                  order.push(group);
                }
                byGroup.get(group)!.push(item);
              }
              return filterSuggestionItems(
                order.flatMap((group) => byGroup.get(group)!),
                query
              );
            }}
          />
        </BlockNoteView>
        </PageLinkOpenContext.Provider>
      </PageLinkSearchContext.Provider>
    );
  }
);
