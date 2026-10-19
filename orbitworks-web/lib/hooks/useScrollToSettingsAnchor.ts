"use client";

import { useEffect, useRef, useState } from "react";
import { useSettingsTabs, type SettingsTabId } from "@/lib/hooks/useSettingsTabs";

// How long the highlight pulse (app/globals.css's .settings-highlight) stays
// on the target row.
const HIGHLIGHT_MS = 1600;

// Drives "pick a search result -> switch tab -> scroll to -> briefly
// highlight the row." The target row only exists in the DOM once the
// destination tab's cards actually render, so this waits a frame after the
// tab (and the DOM under it) changes before querying getElementById -
// never assumes the id is already there in the same tick setActiveTab was
// called. Highlighting is done via direct class toggling on the DOM node
// itself, not React state threaded through every card, so none of the
// existing card components need a highlight-related prop.
export function useScrollToSettingsAnchor() {
  const { activeTab, setActiveTab } = useSettingsTabs();
  const [pendingAnchorId, setPendingAnchorId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function goToSetting(tab: SettingsTabId, anchorId: string) {
    setActiveTab(tab);
    setPendingAnchorId(anchorId);
  }

  useEffect(() => {
    if (!pendingAnchorId) return;
    const anchorId = pendingAnchorId;

    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(anchorId);
      if (!el) {
        // The destination tab's own URL update (setActiveTab ->
        // router.replace) hasn't come back through useSearchParams yet on
        // this pass, so its cards haven't rendered - leave pendingAnchorId
        // set rather than giving up. activeTab changing (the dependency
        // below) is what re-runs this effect once that catches up.
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      el.classList.add("settings-highlight");
      highlightTimeoutRef.current = setTimeout(() => {
        el.classList.remove("settings-highlight");
      }, HIGHLIGHT_MS);
      setPendingAnchorId(null);
    });

    return () => cancelAnimationFrame(frame);
    // Re-runs on activeTab too: switching tabs re-renders the destination
    // tab's cards, which is what actually puts the target id in the DOM.
  }, [pendingAnchorId, activeTab]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  return { activeTab, setActiveTab, goToSetting };
}
