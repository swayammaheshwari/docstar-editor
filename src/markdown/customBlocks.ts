import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

// The exact inverse of `wrapCustomBlocksForMarkdown` (DocstarEditor.tsx).
//
// That function writes every block markdown can't represent — `pageLink`,
// `alert`, `toggleListItem`, `video`/`audio`, a resized `image`, and
// underlined/colored text runs — out as a literal wrapper tag inside an
// otherwise ordinary paragraph. Nothing read those tags back: BlockNote's
// `tryParseMarkdownToBlocks` runs remark-parse -> remark-rehype with raw HTML
// passthrough DISABLED, so every one of those tags is silently unwrapped
// before the HTML ever reaches a parse rule. A `<card href="x">Title</card>`
// came back as a paragraph reading "Title" — the page id, and the block
// itself, gone. That's why a page-link card turned into a paragraph on any
// reload that went through markdown, and why dropping one (which re-parses
// the exported HTML) did the same.
//
// This module replaces that import path entirely:
//   1. markdown -> HTML through our own remark pipeline, with
//      `allowDangerousHtml` at both ends so the wrapper tags survive,
//   2. a normalization pass that puts those tags into the shape BlockNote's
//      own parse rules (and the `parse` implementations on our custom block
//      specs) actually match,
//   3. a toggle-reconstruction pass, because `toggleListItem` nesting is
//      flattened on export and can only be rebuilt from the paired
//      `<toggle-summary>`/`<toggle-end>` markers.
//
// Must match doc-rtc's `src/service/markdown/customBlocks.ts` exactly — both
// read the same on-disk format, the same way `wrapCustomBlocksForMarkdown` is
// duplicated across the two packages.
//
// Everything here is plain string work, deliberately: no DOM is touched, so
// the client bundle and doc-rtc's Node process run byte-identical logic.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any;

// `tryParseHTMLToBlocks` is synchronous on the client editor and asynchronous
// on `ServerBlockNoteEditor`, so this accepts either and awaits the result.
type ParseHTMLToBlocks = (html: string) => Block[] | Promise<Block[]>;

// Block-level wrapper tags. remark has no idea these are block-level, so it
// parses each one as inline HTML inside a paragraph — and a custom block
// nested inside a `<p>` never matches a block parse rule (confirmed: the card
// comes back as a paragraph). Unwrapping the `<p>` is what makes the parse
// rules fire.
const BLOCK_LEVEL_TAGS = [
  "card",
  "alert",
  "toggle-summary",
  "toggle-end",
  "video-embed",
  "audio-embed",
];

const UNWRAP_PARAGRAPH_RE = new RegExp(
  `<p>\\s*(<(${BLOCK_LEVEL_TAGS.join("|")})\\b[\\s\\S]*?<\\/\\2>)\\s*<\\/p>`,
  "g"
);

const MEDIA_EMBED_RE = /<(video|audio)-embed\b([^>]*)><\/\1-embed>/g;

// `wrapStyledInlineContent` emits BlockNote's own `data-text-color` /
// `data-background-color` attribute names so the public page's CSS can mirror
// BlockNote's color rules directly. BlockNote's *parser*, though, only
// recognizes its exporter's shape — one nested `<span data-style-type>` per
// color. Translating on the way in keeps the on-disk attribute names (which
// hitman-ui's `htmlUtils.js` depends on) while making the colors round-trip.
const COLOR_SPAN_RE =
  /<span ((?:data-text-color="[^"]*"\s*)?(?:data-background-color="[^"]*"\s*)?)>([\s\S]*?)<\/span>/g;

const TOGGLE_MARKER_RE =
  /<toggle-summary data-toggle-id="([^"]*)">([\s\S]*?)<\/toggle-summary>|<toggle-end data-toggle-id="([^"]*)"><\/toggle-end>/g;

const getAttr = (attrs: string, name: string): string => {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match ? match[1] : "";
};

const escapeAttr = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Converts markdown to HTML while preserving the literal wrapper tags
 * `wrapCustomBlocksForMarkdown` writes. Legacy pre-BlockNote pages whose
 * stored content is raw HTML rather than markdown pass through this untouched
 * too, so one function reads both on-disk formats.
 */
export async function markdownToHtmlPreservingCustomTags(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);
  return String(file);
}

/**
 * Rewrites the exported wrapper tags into markup BlockNote's parse rules
 * recognize. `<card>` and `<alert>` only need the surrounding `<p>` removed —
 * the `parse` implementations on their block specs take it from there.
 * `<img width>` and `<u>` already round-trip untouched and are left alone.
 */
export function normalizeCustomTagsHtml(html: string): string {
  return html
    .replace(UNWRAP_PARAGRAPH_RE, "$1")
    .replace(MEDIA_EMBED_RE, (_match, kind: string, attrs: string) => {
      // A bare `<video-embed>` is dropped entirely by BlockNote's parser.
      // Its own exporter emits `<figure data-url data-name data-caption>`
      // wrapping a real `<video>`/`<audio>`, which its parse rules do read —
      // and which carries the name and caption the plain media element has
      // nowhere to put.
      const url = getAttr(attrs, "src");
      const name = getAttr(attrs, "data-name");
      const caption = getAttr(attrs, "data-caption");
      const figcaption = caption ? `<figcaption>${caption}</figcaption>` : "";
      return (
        `<figure data-url="${escapeAttr(url)}" data-name="${escapeAttr(name)}"` +
        ` data-caption="${escapeAttr(caption)}"><${kind} src="${escapeAttr(url)}"></${kind}>` +
        `${figcaption}</figure>`
      );
    })
    .replace(COLOR_SPAN_RE, (match, attrs: string, content: string) => {
      const textColor = getAttr(attrs, "data-text-color");
      const backgroundColor = getAttr(attrs, "data-background-color");
      if (!textColor && !backgroundColor) return match;
      let inner = content;
      if (backgroundColor) {
        inner = `<span data-style-type="backgroundColor" data-value="${escapeAttr(backgroundColor)}">${inner}</span>`;
      }
      if (textColor) {
        inner = `<span data-style-type="textColor" data-value="${escapeAttr(textColor)}">${inner}</span>`;
      }
      return inner;
    });
}

type ToggleNode =
  | { type: "html"; html: string }
  | { type: "toggle"; id: string; summaryHtml: string; children: ToggleNode[] };

/**
 * Rebuilds the tree the toggle markers encode. On export a `toggleListItem`
 * becomes a `<toggle-summary>` paragraph, its (un-nested) body, then a
 * `<toggle-end>` marker — paired by `data-toggle-id` rather than by
 * proximity, because a toggle nested inside another toggle's body puts the
 * inner pair's markers before the outer's in the flattened sequence.
 */
function buildToggleTree(html: string): ToggleNode[] {
  const root: { children: ToggleNode[] } = { children: [] };
  const stack: Array<{ id?: string; children: ToggleNode[] }> = [root];
  let cursor = 0;
  let match: RegExpExecArray | null;

  TOGGLE_MARKER_RE.lastIndex = 0;
  while ((match = TOGGLE_MARKER_RE.exec(html)) !== null) {
    const top = stack[stack.length - 1];
    if (match.index > cursor) {
      top.children.push({ type: "html", html: html.slice(cursor, match.index) });
    }
    cursor = match.index + match[0].length;

    if (match[1] !== undefined) {
      const node: ToggleNode = {
        type: "toggle",
        id: match[1],
        summaryHtml: match[2],
        children: [],
      };
      top.children.push(node);
      stack.push(node);
    } else {
      // Close the matching toggle, discarding any unclosed ones inside it.
      const id = match[3];
      for (let i = stack.length - 1; i > 0; i--) {
        const frame = stack[i];
        if ("id" in frame && frame.id === id) {
          stack.length = i;
          break;
        }
      }
    }
  }

  if (cursor < html.length) {
    stack[stack.length - 1].children.push({ type: "html", html: html.slice(cursor) });
  }
  return root.children;
}

async function toggleTreeToBlocks(
  nodes: ToggleNode[],
  parseHTMLToBlocks: ParseHTMLToBlocks
): Promise<Block[]> {
  const blocks: Block[] = [];
  let buffer = "";

  const flush = async () => {
    if (buffer.trim()) blocks.push(...(await parseHTMLToBlocks(buffer)));
    buffer = "";
  };

  for (const node of nodes) {
    if (node.type === "html") {
      buffer += node.html;
      continue;
    }
    await flush();
    const summaryBlocks = await parseHTMLToBlocks(`<p>${node.summaryHtml}</p>`);
    blocks.push({
      type: "toggleListItem",
      props: {},
      content: summaryBlocks[0]?.content ?? [],
      children: await toggleTreeToBlocks(node.children, parseHTMLToBlocks),
    });
  }

  await flush();
  return blocks;
}

/**
 * The import counterpart to `blocksToMarkdownLossy(wrapCustomBlocksForMarkdown(...))`.
 * Use this everywhere `tryParseMarkdownToBlocks` used to be called — it is
 * the only path that reconstructs custom blocks instead of flattening them
 * into paragraphs.
 */
export async function markdownToBlocksPreservingCustomBlocks(
  markdown: string,
  parseHTMLToBlocks: ParseHTMLToBlocks
): Promise<Block[]> {
  const html = normalizeCustomTagsHtml(await markdownToHtmlPreservingCustomTags(markdown));
  const blocks = await toggleTreeToBlocks(buildToggleTree(html), parseHTMLToBlocks);
  // Never hand back an empty array. BlockNote's own `tryParseMarkdownToBlocks`
  // returns a single empty paragraph for empty or whitespace-only input, and
  // callers feed this straight to `replaceBlocks` — replacing a document with
  // zero blocks leaves it in a state ProseMirror's schema doesn't allow
  // (`blockGroup` requires `blockContainer+`), which it then silently repairs,
  // losing the caller's cursor and emitting a "TextSelection endpoint not
  // pointing into a node with inline content" warning. Matching the built-in
  // parser's contract keeps that from ever arising.
  return blocks.length > 0 ? blocks : [{ type: "paragraph", props: {}, content: [] }];
}
