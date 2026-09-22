import { useEffect, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Menu, Popover, TextInput, ScrollArea, Loader, Text, UnstyledButton } from "@mantine/core";
import { MdLink, MdMoreHoriz, MdOutlineArticle } from "react-icons/md";
import { usePageLinkSearch, type PageSearchResult } from "./pageLinkContext";

// Debounces the query so every keystroke doesn't fire a search call.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

function PagePicker({
  opened,
  onClose,
  onSelect,
  anchor,
}: {
  opened: boolean;
  onClose: () => void;
  onSelect: (page: PageSearchResult) => void;
  anchor: React.ReactNode;
}) {
  const searchPages = usePageLinkSearch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);
  const requestId = useRef(0);

  useEffect(() => {
    if (!opened || !searchPages) return;
    const id = ++requestId.current;
    setLoading(true);
    searchPages(debouncedQuery)
      .then((pages) => {
        if (requestId.current === id) setResults(pages);
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, [opened, debouncedQuery, searchPages]);

  useEffect(() => {
    if (!opened) setQuery("");
  }, [opened]);

  return (
    <Popover opened={opened} onClose={onClose} withinPortal={false} position="bottom-start" shadow="md">
      <Popover.Target>{anchor}</Popover.Target>
      <Popover.Dropdown>
        <div className="page-link-picker" contentEditable={false}>
          <TextInput
            autoFocus
            placeholder="Search pages…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <ScrollArea.Autosize mah={240} className="page-link-picker-results">
            {loading && (
              <div className="page-link-picker-status">
                <Loader size="xs" />
              </div>
            )}
            {!loading && !searchPages && (
              <Text size="sm" c="dimmed" className="page-link-picker-status">
                Page search isn't available here.
              </Text>
            )}
            {!loading && searchPages && results.length === 0 && (
              <Text size="sm" c="dimmed" className="page-link-picker-status">
                No pages found.
              </Text>
            )}
            {!loading &&
              results.map((page) => (
                <UnstyledButton
                  key={page.id}
                  className="page-link-picker-item"
                  onClick={() => onSelect(page)}
                >
                  {page.image ? (
                    <img src={page.image} alt="" className="page-link-picker-item-image" />
                  ) : (
                    <MdOutlineArticle className="page-link-picker-item-icon" size={16} />
                  )}
                  <span className="page-link-picker-item-title">{page.title}</span>
                </UnstyledButton>
              ))}
          </ScrollArea.Autosize>
        </div>
      </Popover.Dropdown>
    </Popover>
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

      const selectPage = (page: PageSearchResult) => {
        props.editor.updateBlock(props.block, {
          type: "pageLink",
          props: { pageId: page.id, title: page.title, image: page.image ?? "" },
        });
        setPickerOpen(false);
      };

      if (!pageId) {
        return (
          <PagePicker
            opened={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={selectPage}
            anchor={
              <UnstyledButton
                className="page-link-card page-link-card-empty"
                contentEditable={false}
                onClick={() => setPickerOpen(true)}
              >
                <MdLink size={16} />
                <span>Link to a page…</span>
              </UnstyledButton>
            }
          />
        );
      }

      return (
        <div className={image ? "page-link-card has-image" : "page-link-card"} contentEditable={false}>
          {image && <img src={image} alt="" className="page-link-card-image" />}
          <div className="page-link-card-title">{title}</div>
          <Menu withinPortal={false} position="bottom-end">
            <Menu.Target>
              <UnstyledButton className="page-link-card-menu-trigger" onClick={(e) => e.stopPropagation()}>
                <MdMoreHoriz size={18} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <PagePicker
                opened={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={selectPage}
                anchor={<Menu.Item onClick={() => setPickerOpen(true)}>Change page</Menu.Item>}
              />
              <Menu.Item color="red" onClick={() => props.editor.removeBlocks([props.block])}>
                Remove
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      );
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
