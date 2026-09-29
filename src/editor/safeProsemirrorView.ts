// Neutralizes a defect in the editor stack that surfaces as
// "[tiptap error]: The editor view is not available. Cannot access
// view['dom']. The editor may not be mounted yet."
//
// `editor.prosemirrorView` forwards to tiptap's `get view()`, which — while
// the ProseMirror view doesn't exist — returns a *freshly constructed* Proxy
// that throws on any property it doesn't recognize (`dom` and `root` among
// them). Two consequences, both of which BlockNote's own UI walks straight
// into:
//
//   * The proxy is always truthy, so the `editor.prosemirrorView?.dom` style
//     of guard used throughout BlockNote guards nothing at all.
//   * A new identity on every read means `[editor.prosemirrorView]` in a
//     dependency array never compares equal, so any effect keyed on it
//     re-runs on every render while the view is absent. BlockNote's default
//     formatting toolbar does exactly that in `CreateLinkButton`
//     (`@blocknote/react`), whose effect both adds and removes a `keydown`
//     listener on `prosemirrorView.dom` — it is the `No` frame in the
//     reported stack trace.
//
// So whenever the toolbar (or anything else in BlockNote's UI) renders in a
// moment when the view is momentarily absent — a remount, an editor
// recreated in place, a collaboration status change swapping the subtree —
// it throws and takes the page down with it.
//
// Shadowing the getter on our own editor instance fixes both halves: a real,
// mounted view is returned completely untouched, and when there is no view we
// return one stable stub whose `dom`/`root` are detached, inert nodes. Only
// those specific reads are answered; anything else still falls through to
// tiptap's own fallback proxy, so a genuine misuse keeps failing loudly
// rather than being silently swallowed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const installSafeProsemirrorView = (editor: any) => {
  if (!editor || editor.__docstarSafeView || typeof document === "undefined") return;

  let detachedDom: HTMLElement | undefined;
  const getDetachedDom = () => (detachedDom ??= document.createElement("div"));

  const stub = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "dom") return getDetachedDom();
        if (key === "root") return getDetachedDom().ownerDocument;
        if (key === "hasFocus") return () => false;
        if (key === "focus" || key === "blur" || key === "destroy") return () => undefined;
        return editor._tiptapEditor?.view?.[key];
      },
    }
  );

  Object.defineProperty(editor, "prosemirrorView", {
    configurable: true,
    get() {
      return editor._tiptapEditor?.editorView ?? stub;
    },
  });
  editor.__docstarSafeView = true;
};
