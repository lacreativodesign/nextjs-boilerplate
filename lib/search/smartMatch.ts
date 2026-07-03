/**
 * Filter a list of items by a single search term across multiple fields.
 *
 * If `term` is empty/whitespace the list is returned unchanged. Otherwise the
 * term is lowercased and an item is kept when ANY of its provided field values,
 * stringified and lowercased, includes the term.
 *
 * Pure and typed — no side effects, no dependencies.
 */
export function smartMatch<T>(
  items: T[],
  term: string,
  fields: (item: T) => (string | number | null | undefined)[],
): T[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return items;

  return items.filter((item) =>
    fields(item).some((value) => {
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().includes(needle);
    }),
  );
}

export default smartMatch;
