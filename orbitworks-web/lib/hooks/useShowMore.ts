"use client";

import { useState } from "react";
import { showMoreSlice } from "@/lib/listPaging";

// Phase 10 (D7 a): show `step` rows, "Show more" adds `step` more. resetKey
// (for example the search text or a filter) starts over at `step` when it
// changes - reset during render, no effect.
export function useShowMore<T>(items: T[], step: number, resetKey = "") {
  const [shown, setShown] = useState(step);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (resetKey !== seenKey) {
    setSeenKey(resetKey);
    setShown(step);
  }
  const slice = showMoreSlice(items, shown, step);
  return { ...slice, shown: slice.visible.length, showMore: () => setShown((n) => n + step) };
}
