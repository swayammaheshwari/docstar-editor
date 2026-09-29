import { useEffect, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Menu, UnstyledButton } from "@mantine/core";
import { MdLink, MdMoreHoriz, MdOutlineArticle, MdSearch } from "react-icons/md";
import { usePageLinkOpen, usePageLinkSearch, type PageSearchResult } from "./pageLinkContext";

// Debounces the query so every keystroke doesn't fire a search call.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

// Falls back to the generic document icon when a page's stored
// `meta.featureImage.url` no longer resolves — a dead thumbnail otherwise
// renders as the browser's broken-image glyph in the middle of the list.
function PageThumbnail({ image }: { image?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  if (!image || failed) {
    return <MdOutlineArticle className="page-link-picker-item-icon" size={16} />;
  }
  return (
    <img
      src={image}
      alt=""
      className="page-link-picker-item-image"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// A plain-DOM anchored panel rather than Mantine's `Popover`/`ScrollArea`.
// Both misbehave inside a `contentEditable={false}` ProseMirror node view:
// `Popover`'s `onClose` never fires (nothing dismisses the panel), and
// `ScrollArea.Autosize`'s `mah` cap didn't apply in the app build, so a long
// page list ran off the bottom of the screen with no way to scroll it. Owning
// the markup means the scroll container, the keyboard model and the dismissal
// rules are all ours and can't be undone by a dependency's styling.
function PagePicker({
  onSelect,
  onDismiss,
  boundaryRef,
}: {
  onSelect: (page: PageSearchResult) => void;
  onDismiss: () => void;
  // The whole block, not just this panel — clicking the card or the
  // "Link to a page…" button it's anchored to isn't an outside click.
  boundaryRef: React.RefObject<HTMLDivElement | null>;
}) {
  const searchPages = usePageLinkSearch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 250);
  const requestId = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!searchPages) return;
    const id = ++requestId.current;
    setLoading(true);
    searchPages(debouncedQuery)
      .then((pages) => {
        if (requestId.current === id) {
          setResults(pages);
          setActiveIndex(0);
        }
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [debouncedQuery, searchPages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keeps the highlighted row visible while arrowing through a list that's
  // taller than the scroll container.
  useEffect(() => {
    const active = resultsRef.current?.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  // Held in a ref so the listener below can be registered once and still read
  // the current results/activeIndex.
  const keyDownRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyDownRef.current = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter" && event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      onDismiss();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else {
      const page = results[activeIndex];
      if (page) onSelect(page);
    }
  };

  // Has to be a real native listener, not React's `onKeyDown`: React 17+
  // delegates synthetic events from the root container, so a React handler
  // here would only run after the native event has already bubbled through
  // (and been handled by) ProseMirror's own listener on `view.dom`, an
  // ancestor of this node — too late to stop the editor swallowing Escape or
  // moving the caret on the arrow keys. Same reason as `alert.tsx`.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const listener = (event: KeyboardEvent) => keyDownRef.current(event);
    el.addEventListener("keydown", listener);
    return () => el.removeEventListener("keydown", listener);
  }, []);

  // Dismiss on an outside click. Registered only while the panel is mounted,
  // and on `mousedown` so it settles before the click lands anywhere else.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || boundaryRef.current?.contains(target)) return;
      onDismiss();
    };
    doc.addEventListener("mousedown", onMouseDown);
    return () => doc.removeEventListener("mousedown", onMouseDown);
  }, [onDismiss, boundaryRef]);

  return (
    <div className="page-link-picker" contentEditable={false} ref={rootRef}>
      <div className="page-link-picker-search">
        <MdSearch size={16} className="page-link-picker-search-icon" />
        <input
          ref={inputRef}
          className="page-link-picker-input"
          placeholder="Search pages…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div className="page-link-picker-results" ref={resultsRef}>
        {loading && <div className="page-link-picker-status">Searching…</div>}
        {!loading && !searchPages && (
          <div className="page-link-picker-status">Page search isn't available here.</div>
        )}
        {!loading && searchPages && results.length === 0 && (
          <div className="page-link-picker-status">
            {query.trim() ? `No pages match "${query.trim()}".` : "No pages to link to yet."}
          </div>
        )}
        {!loading &&
          results.map((page, index) => (
            <button
              type="button"
              key={page.id}
              className="page-link-picker-item"
              data-active={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(page)}
            >
              <PageThumbnail image={page.image} />
              <span className="page-link-picker-item-title">{page.title}</span>
            </button>
          ))}
      </div>
      <div className="page-link-picker-footer">↑↓ navigate · ↵ select · esc close</div>
    </div>
  );
}

// The PageLink block links to another page in the workspace. It has no
// editable rich-text content of its own (`content: "none"`) — its title and
// cover image are a snapshot of the target page's own name/cover image,
// captured when the page is picked, not free text the user types.
export const PageLink = createReactBlockSpec(
  {
    type: "pageLink",
    propSchema: {
      pageId: { default: "" },
      title: { default: "" },
      image: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { pageId, title, image } = props.block.props;
      const [pickerOpen, setPickerOpen] = useState(!pageId);
      const shellRef = useRef<HTMLDivElement | null>(null);
      // Only clickable when the host supplied a navigator — this package
      // can't turn a page id into a URL on its own. While the picker is open
      // the card must stay inert, or dismissing the picker by clicking the
      // card underneath would navigate away instead.
      const openPage = usePageLinkOpen();
      const openLinkedPage = !pickerOpen ? openPage : undefined;

      const selectPage = (page: PageSearchResult) => {
        props.editor.updateBlock(props.block, {
          type: "pageLink",
          props: { pageId: page.id, title: page.title, image: page.image ?? "" },
        });
        setPickerOpen(false);
      };

      // Escape or an outside click on a block that never got a page removes
      // it outright, rather than leaving a dangling "Link to a page…"
      // placeholder behind that would also export as an empty
      // `<card href="">`.
      const dismiss = () => {
        setPickerOpen(false);
        if (!pageId) props.editor.removeBlocks([props.block]);
      };

      if (!pageId) {
        return (
          <div className="page-link-shell" contentEditable={false} ref={shellRef}>
            <UnstyledButton
              className="page-link-card page-link-card-empty"
              draggable={false}
              onClick={() => setPickerOpen(true)}
            >
              <MdLink size={16} />
              <span>Link to a page…</span>
            </UnstyledButton>
            {pickerOpen && (
              <PagePicker onSelect={selectPage} onDismiss={dismiss} boundaryRef={shellRef} />
            )}
          </div>
        );
      }

      return (
        <div className="page-link-shell" contentEditable={false} ref={shellRef}>
          {/* `draggable={false}` on the card and its image is what BlockNote's
              own content-less blocks (image/video/audio) do, and it's load-
              bearing here: the generated tiptap node has no `draggable: true`
              (block specs have no such option), so ProseMirror's dragstart
              handler can't build a NodeSelection for it and falls back to
              dragging `view.state.selection.content()` — whatever paragraph
              the caret happens to be in. An `<img>` is natively draggable in
              every browser, so dragging the card's cover reliably dropped a
              stray paragraph. Turning native dragging off leaves the side
              menu's drag handle as the only drag path, and that one
              round-trips the block correctly. */}
          <div
            className={image ? "page-link-card has-image" : "page-link-card"}
            draggable={false}
            role={openLinkedPage ? "link" : undefined}
            tabIndex={openLinkedPage ? 0 : undefined}
            onClick={openLinkedPage ? () => openLinkedPage(pageId) : undefined}
            onKeyDown={
              openLinkedPage
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openLinkedPage(pageId);
                    }
                  }
                : undefined
            }
          >
            {image && (
              <img src={image} alt="" className="page-link-card-image" draggable={false} />
            )}
            {/* Title and kebab share a row of their own. Without this
                wrapper the kebab is a direct child of the card, which
                `has-image` switches to `flex-direction: column` — so on a
                card with a cover image the kebab stacked *below* the title
                instead of sitting beside it. */}
            <div className="page-link-card-body">
              <div className="page-link-card-title">{title}</div>
              <Menu withinPortal={false} position="bottom-end">
                <Menu.Target>
                  <UnstyledButton
                    className="page-link-card-menu-trigger"
                    // Keeps the kebab (and everything in its dropdown) from
                    // also triggering the card's navigate-on-click.
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MdMoreHoriz size={18} />
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                  <Menu.Item onClick={() => setPickerOpen(true)}>Change page</Menu.Item>
                  <Menu.Item color="red" onClick={() => props.editor.removeBlocks([props.block])}>
                    Remove
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          </div>
          {pickerOpen && (
            <PagePicker onSelect={selectPage} onDismiss={dismiss} boundaryRef={shellRef} />
          )}
        </div>
      );
    },
    // Reads back the `<card>` tag that `toExternalHTML` (and, via
    // `wrapCustomBlocksForMarkdown`, the markdown exporter) writes. Without
    // this there is no parse rule matching `<card>` at all, so every import
    // path — markdown reload, collab bootstrap, drop, paste — degraded the
    // block to a paragraph holding the bare title. The import side of the
    // markdown path additionally needs `src/markdown/customBlocks.ts`, which
    // is what gets the tag as far as this function.
    parse: (element) => {
      if (element.tagName !== "CARD") return undefined;
      const image = element.querySelector("img")?.getAttribute("src") ?? "";
      return {
        pageId: element.getAttribute("href") ?? "",
        title: (element.textContent ?? "").trim(),
        image,
      };
    },
    // Markdown has no native card syntax, and (like `alert`) BlockNote's
    // markdown exporter drops unrecognized custom elements — the literal
    // `<card href="...">...</card>` wrapper in exported markdown comes from
    // `wrapCustomBlocksForMarkdown` in `DocstarEditor.tsx` instead, right
    // before serialization. `toExternalHTML` here only matters for
    // non-markdown HTML export (e.g. clipboard copy).
    toExternalHTML: (props) => (
      <div>
        <card href={props.block.props.pageId}>
          {props.block.props.image ? <img src={props.block.props.image} /> : null}
          {props.block.props.title}
        </card>
      </div>
    ),
  }
);
