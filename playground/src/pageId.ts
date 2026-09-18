export const PAGE_ID_PATTERN = /^[a-z0-9_-]+$/;

export function isValidPageId(value: string): boolean {
  return PAGE_ID_PATTERN.test(value);
}
