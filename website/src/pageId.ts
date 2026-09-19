export const PAGE_ID_PATTERN = /^[a-z0-9_-]+$/;

export function isValidPageId(value: string): boolean {
  return PAGE_ID_PATTERN.test(value);
}

/** Turns a free-form document name into a valid, likely-unique document id. */
export function slugifyDocumentName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || "untitled"}-${suffix}`;
}

/** A random id for documents created without a user-supplied name (e.g. import). */
export function randomDocumentId(): string {
  return `doc-${Math.random().toString(36).slice(2, 10)}`;
}
