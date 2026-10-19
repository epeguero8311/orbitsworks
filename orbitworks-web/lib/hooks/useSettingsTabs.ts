"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const SETTINGS_TABS = ["general", "export", "automations", "alerts", "mobile"] as const;
export type SettingsTabId = (typeof SETTINGS_TABS)[number];

export const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  general: "General",
  export: "Export Settings",
  automations: "Automations",
  alerts: "Alerts",
  mobile: "Mobile App",
};

const DEFAULT_TAB: SettingsTabId = "general";

function isSettingsTabId(value: string | null): value is SettingsTabId {
  return !!value && (SETTINGS_TABS as readonly string[]).includes(value);
}

// Keeps the active Settings tab in the URL (?tab=general|export|automations|
// alerts|mobile) so a refresh or a shared link lands on the same tab -
// General is the fallback for a missing or garbage value. Uses
// router.replace, not push: a tab switch is an in-page view change, not a
// new place to land on with the back button, same as any other filter/view
// toggle elsewhere in this app.
export function useSettingsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab: SettingsTabId = isSettingsTabId(rawTab) ? rawTab : DEFAULT_TAB;

  const setActiveTab = useCallback(
    (tab: SettingsTabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return { activeTab, setActiveTab };
}
