// The page title is the page's only <h1>. Content headings start at <h2>,
// but the menus still call that "Heading 1": every menu label is one below
// the level that's stored, rendered and exported (Heading 1 = h2 … Heading 5
// = h6). Level 1 never appears in a menu and is pushed down wherever it gets
// in — old pages, pasted content, the `# ` shortcut, other writers.
import { en } from "@blocknote/core/locales";

const MAX_LEVEL = 6;

export const headingDictionary = {
  ...en,
  slash_menu: {
    ...en.slash_menu,
    heading_2: { ...en.slash_menu.heading_2, title: "Heading 1", subtext: "Top-level heading", aliases: ["h", "h1", "heading", "heading1"] },
    heading_3: { ...en.slash_menu.heading_3, title: "Heading 2", subtext: "Key section heading", aliases: ["h2", "heading2", "subheading"] },
    heading_4: { ...en.slash_menu.heading_4, title: "Heading 3", subtext: "Subsection and group heading", aliases: ["h3", "heading3"], group: en.slash_menu.heading_2.group },
    heading_5: { ...en.slash_menu.heading_5, title: "Heading 4", subtext: "Minor subsection heading", aliases: ["h4", "heading4"] },
    heading_6: { ...en.slash_menu.heading_6, title: "Heading 5", subtext: "Lowest-level heading", aliases: ["h5", "heading5"] },
    toggle_heading_2: { ...en.slash_menu.toggle_heading_2, title: "Toggle Heading 1", aliases: ["h1", "heading1", "collapsable"] },
    toggle_heading_3: { ...en.slash_menu.toggle_heading_3, title: "Toggle Heading 2", aliases: ["h2", "heading2", "collapsable"] },
  },
};

// Slash-menu items that would insert a level-1 heading.
export const LEVEL_ONE_SLASH_KEYS = new Set(["heading", "toggle_heading"]);

const isHeading = (block: any) => block.type === "heading" && typeof block.props?.level === "number";

const someBlock = (blocks: readonly any[], test: (block: any) => boolean): boolean =>
  blocks.some((block) => test(block) || (block.children?.length > 0 && someBlock(block.children, test)));

const forEachBlock = (blocks: readonly any[], fn: (block: any) => void) => {
  for (const block of blocks) {
    fn(block);
    if (block.children?.length) forEachBlock(block.children, fn);
  }
};

const hasLevelOne = (blocks: readonly any[]) => someBlock(blocks, (b) => isHeading(b) && b.props.level === 1);

const demoted = (level: number) => Math.min(level + 1, MAX_LEVEL);

// For content about to be loaded (markdown parsed to blocks): if it still uses
// level 1, it was written with h1 as its top level — move every heading down
// one, keeping the hierarchy (h6 stays h6).
export const demoteLoadedHeadings = <T>(blocks: T[]): T[] => {
  if (!hasLevelOne(blocks)) return blocks;
  const shift = (list: any[]): any[] =>
    list.map((block) => ({
      ...block,
      ...(isHeading(block) ? { props: { ...block.props, level: demoted(block.props.level) } } : {}),
      ...(block.children?.length ? { children: shift(block.children) } : {}),
    }));
  return shift(blocks as any[]) as T[];
};

// The same, for a document already in the editor (a collab document arrives
// from the server rather than through a load we can intercept).
export const demoteDocumentHeadings = (editor: any) => {
  if (!hasLevelOne(editor.document)) return;
  editor.transact(() => {
    forEachBlock(editor.document, (block) => {
      if (isHeading(block)) editor.updateBlock(block.id, { props: { level: demoted(block.props.level) } });
    });
  });
};

// `id → "type:level"` for every block, to tell which headings a paste wrote.
export const snapshotHeadings = (editor: any): Map<string, string> => {
  const snapshot = new Map<string, string>();
  forEachBlock(editor.document, (block) => snapshot.set(block.id, `${block.type}:${block.props?.level ?? ""}`));
  return snapshot;
};

// Moves the headings a paste wrote down one level, keeping the pasted
// hierarchy (pasted h1/h2/h3 → Heading 1/2/3). A heading counts as pasted if
// it's new or wasn't this heading before — the first pasted block can take
// over the id of the paragraph it was pasted into.
export const demotePastedHeadings = (editor: any, before: Map<string, string>) => {
  const pasted: any[] = [];
  forEachBlock(editor.document, (block) => {
    if (isHeading(block) && before.get(block.id) !== `heading:${block.props.level}`) pasted.push(block);
  });
  if (!pasted.length) return;
  editor.transact(() => {
    for (const block of pasted) editor.updateBlock(block.id, { props: { level: demoted(block.props.level) } });
  });
};

// Anything else that creates a level-1 heading — the `# ` / Mod-Alt-1
// shortcuts, a collaborator on an older editor — becomes Heading 1 (h2).
export const watchLevelOneHeadings = (editor: any) =>
  editor.onChange(() => {
    // Deferred: a paste's own demotion runs synchronously right after the
    // paste, and must see the pasted levels untouched.
    queueMicrotask(() => {
      if (!hasLevelOne(editor.document)) return;
      editor.transact(() => {
        forEachBlock(editor.document, (block) => {
          if (isHeading(block) && block.props.level === 1) editor.updateBlock(block.id, { props: { level: 2 } });
        });
      });
    });
  });
