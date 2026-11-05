// Phase 10 fix round 1 (W3, W4, W5, D7 a, D8 a, D9 a, D10 a) - long lists
// on the website show a few rows at a time with a "Show N more" button.
// Display only: the page still has the whole list (search, counts, the
// duplicate flag and the dropdowns need it). No imports, so
// test/listPaging.test.mjs runs it under plain Node.

export const EMPLOYEES_PAGE_SIZE = 20;
export const SITES_PAGE_SIZE = 10;
export const TITLES_PAGE_SIZE = 10;

// The first `shown` items, how many are hidden, and what the next button
// adds (never more than what is left).
export function showMoreSlice<T>(items: T[], shown: number, step: number) {
  const count = Math.max(step, shown);
  const visible = items.slice(0, count);
  const hidden = Math.max(0, items.length - visible.length);
  return { visible, total: items.length, hidden, nextStep: Math.min(step, hidden) };
}

// "Showing 20 of 57" - null when everything is shown.
export function showingText(shown: number, total: number): string | null {
  if (total <= shown) return null;
  return `Showing ${shown} of ${total}`;
}

// Lower case, accents and extra spaces removed, so "Jose" finds "Jose" and
// "JOSE" alike.
export function normalizeSearch(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// D10 a: the search box matches the name or the email. Every word typed
// must appear somewhere in them. An empty search matches everyone.
export function employeeMatchesSearch(employee: { name?: unknown; email?: unknown }, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = `${normalizeSearch(employee.name)} ${normalizeSearch(employee.email)}`;
  return q.split(" ").every((word) => hay.includes(word));
}

// D9 a: active employees in "All employees", inactive ones in their own
// list (shown with "Show inactive"). Same order as given.
export function splitByActive<T extends { active?: boolean }>(employees: T[]) {
  const active: T[] = [];
  const inactive: T[] = [];
  for (const e of employees) (e.active ? active : inactive).push(e);
  return { active, inactive };
}
