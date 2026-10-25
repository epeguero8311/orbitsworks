"use client";

import { useState } from "react";

// Client-side paging over an already-loaded list. If the list shrinks,
// the page clamps to the last one that still exists.
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const end = Math.min(start + pageSize, items.length);

  return {
    pageItems: items.slice(start, end),
    start,
    end,
    total: items.length,
    hasPrev: current > 0,
    hasNext: current < pageCount - 1,
    prev: () => setPage(Math.max(0, current - 1)),
    next: () => setPage(Math.min(pageCount - 1, current + 1)),
  };
}
