import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { decodeEmbedCode, encodeEmbedCode } from "../markdown/customBlocks";

// Message the preview iframe posts with its content height, so the frame can
// grow to fit the widget instead of clipping it at a fixed size.
const HEIGHT_MESSAGE = "docstar-html-embed-height";
const MIN_PREVIEW_HEIGHT = 40;

// The author's snippet runs inside a sandboxed `srcdoc` iframe. Without
// `allow-same-origin` it gets an opaque origin: it cannot read the dashboard's
// cookies, storage or DOM, which is what makes running arbitrary pasted
// scripts inside the editor acceptable. (A snippet that itself relies on
// `localStorage` may therefore behave differently here than on the public
// page, where it runs unsandboxed.) `<base target="_blank">` sends the
// widget's links to a new tab rather than navigating the frame.
//
// Height is measured on `<body>`, not `<html>`: `documentElement.scrollHeight`
// never reports less than the frame's own viewport, so once the frame had
// grown it could never shrink back (a widget that rendered taller while its
// stylesheet loaded kept ~200px of blank space below it). `flow-root` keeps
// the first/last child's margins inside the body so they're counted.
const buildPreviewDocument = (code: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
  `<style>html,body{margin:0;padding:0;font-family:system-ui,sans-serif;}body{display:flow-root;}</style></head>` +
  `<body>${code}<script>(function(){var post=function(){parent.postMessage({type:"${HEIGHT_MESSAGE}",` +
  `height:document.body.getBoundingClientRect().height},"*");};` +
  `new ResizeObserver(post).observe(document.body);window.addEventListener("load",post);post();})();` +
  `</script></body></html>`;

function EmbedPreview({ code }: { code: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(150);
  const srcDoc = useMemo(() => buildPreviewDocument(code), [code]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Every embed on the page posts the same message type — only take the
      // one coming from this block's own frame.
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== HEIGHT_MESSAGE) return;
      const next = Number(event.data.height);
      if (Number.isFinite(next)) setHeight(Math.max(MIN_PREVIEW_HEIGHT, Math.ceil(next)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frameRef}
      className="html-embed-preview"
      title="HTML embed preview"
      sandbox="allow-scripts allow-popups allow-forms"
      srcDoc={srcDoc}
      style={{ height }}
    />
  );
}

function EmbedCodeEditor({
  initialCode,
  onSave,
  onCancel,
}: {
  initialCode: string;
  onSave: (code: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialCode);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Held in refs so the native listeners below register once and still see
  // the current draft.
  const saveRef = useRef(() => {});
  // A no-op while empty, same as the disabled Embed button — saving an empty
  // draft would remove the block outright.
  saveRef.current = () => {
    if (draft.trim()) onSave(draft.trim());
  };
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Native listeners, not React's `onKeyDown`/`onPaste`: ProseMirror's own
  // listeners sit on `view.dom`, an ancestor of this node, and React's
  // delegated handlers only run after the native event has already bubbled
  // through them (same reason as `PagePicker` in pageLink.tsx). Without
  // stopping these here the editor swallows Enter/Backspace/arrows and turns
  // a paste into the textarea into a paste into the document.
  //
  // `input`/`beforeinput` must NOT be stopped: React's `onChange` is driven
  // by the native `input` event reaching React's root listener, so stopping
  // it left `draft` permanently empty — the Embed button never enabled, and
  // Cmd+Enter saved nothing. ProseMirror already ignores input coming from a
  // textarea inside a node view (tiptap's `stopEvent`).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const stop = (event: Event) => event.stopPropagation();
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRef.current();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        saveRef.current();
      }
    };
    const passthrough = ["keyup", "keypress", "paste", "cut", "copy", "drop"] as const;
    el.addEventListener("keydown", onKeyDown);
    passthrough.forEach((type) => el.addEventListener(type, stop));
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      passthrough.forEach((type) => el.removeEventListener(type, stop));
    };
  }, []);

  return (
    <div className="html-embed-editor">
      <textarea
        ref={textareaRef}
        className="html-embed-textarea"
        placeholder="Paste HTML or a <script> embed code…"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="html-embed-actions">
        <span className="html-embed-hint">⌘/Ctrl + Enter to embed</span>
        <button type="button" className="html-embed-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="html-embed-button html-embed-button-primary"
          disabled={!draft.trim()}
          onClick={() => saveRef.current()}
        >
          Embed
        </button>
      </div>
    </div>
  );
}

// Raw HTML/script embed (the old Tiptap editor's `embed` node). Stored as
// `<html-embed data-embed-code="BASE64">` — see `encodeEmbedCode` in
// markdown/customBlocks.ts — and rendered on the public page by hitman-ui's
// htmlUtils, whose `data-embed` wrapper `HtmlWithScripts` executes.
export const HtmlEmbed = createReactBlockSpec(
  {
    type: "htmlEmbed",
    propSchema: {
      code: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { code } = props.block.props;
      const [editing, setEditing] = useState(!code);

      const save = (next: string) => {
        if (!next) {
          props.editor.removeBlocks([props.block]);
          return;
        }
        props.editor.updateBlock(props.block, { type: "htmlEmbed", props: { code: next } });
        setEditing(false);
      };

      // Cancelling a block that never got any code removes it, rather than
      // leaving an empty embed behind (same as pageLink's `dismiss`).
      const cancel = () => {
        if (!code) props.editor.removeBlocks([props.block]);
        else setEditing(false);
      };

      // `draggable={false}` for the same reason as pageLink's card: native
      // dragging inside a content-less block drops a stray paragraph, while
      // the side menu's drag handle moves the block correctly.
      return (
        <div className="html-embed-shell" contentEditable={false} draggable={false}>
          {editing ? (
            <EmbedCodeEditor initialCode={code} onSave={save} onCancel={cancel} />
          ) : (
            <>
              <EmbedPreview code={code} />
              {props.editor.isEditable && (
                <button
                  type="button"
                  className="html-embed-button html-embed-edit"
                  onClick={() => setEditing(true)}
                >
                  Edit code
                </button>
              )}
            </>
          )}
        </div>
      );
    },
    // Reads back the `<html-embed>` tag both `toExternalHTML` below and the
    // markdown exporter (`wrapCustomBlocksForMarkdown`) write. Must mirror
    // doc-rtc's `parse` in src/service/blocks/htmlEmbed.ts.
    parse: (element) => {
      if (element.tagName !== "HTML-EMBED") return undefined;
      return { code: decodeEmbedCode(element.getAttribute("data-embed-code") ?? "") };
    },
    // `createElement` rather than JSX: `html-embed` isn't a known intrinsic
    // element, and spelling it as JSX fails the type check (as `<card>` and
    // `<alert>` currently do in pageLink.tsx/alert.tsx).
    toExternalHTML: (props) =>
      createElement("div", null, createElement("html-embed", { "data-embed-code": encodeEmbedCode(props.block.props.code) })),
  }
);
