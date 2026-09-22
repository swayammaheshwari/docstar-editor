import { createContext, useContext } from "react";

export interface PageSearchResult {
  id: string;
  title: string;
  image?: string;
}

// Threaded through React context (rather than a BlockNote block-spec option)
// because `createReactBlockSpec`'s schema is defined once at module scope,
// with no per-editor-instance channel for host callbacks — but its `render`
// output mounts inside the same React tree as `<BlockNoteView>`, so a
// Context.Provider wrapping that view reaches it normally. Mirrors how
// `uploadFile` reaches BlockNote itself, just for a capability BlockNote's
// own options don't have a slot for.
export type SearchPagesFn = (query: string) => Promise<PageSearchResult[]>;

export const PageLinkSearchContext = createContext<SearchPagesFn | undefined>(undefined);

export const usePageLinkSearch = () => useContext(PageLinkSearchContext);
