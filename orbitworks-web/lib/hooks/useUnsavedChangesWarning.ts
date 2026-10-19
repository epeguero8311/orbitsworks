"use client";

import { useEffect } from "react";

// Warns before the user leaves the page with unsaved changes.
//
// beforeunload covers an actual browser navigation (refresh, close tab,
// typed URL, closing the window) - standard and always available.
//
// The capture-phase click listener covers in-app <Link> navigation away
// from `scopePathname` (e.g. clicking a sidebar link to Reports). This is
// self-contained to the Settings page: it's only ever installed while this
// hook is mounted and dirty, and it only intercepts a click whose resolved
// href leaves scopePathname - a tab-switch button (a plain <button>, not an
// <a>, per useSettingsTabs.ts) never matches the `a[href]` selector, so
// switching tabs within Settings is never affected. Runs in the capture
// phase so, on cancel, stopPropagation() keeps the event from ever reaching
// next/link's own bubble-phase handler - the click never results in a
// navigation at all.
export function useUnsavedChangesWarning(isDirty: boolean, scopePathname: string) {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }

    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement | null)?.closest("a[href]");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === scopePathname) return;

      if (!window.confirm("You have unsaved changes. Leave anyway?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [isDirty, scopePathname]);
}
