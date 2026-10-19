"use client";

import { SETTINGS_TABS, SETTINGS_TAB_LABELS, type SettingsTabId } from "@/lib/hooks/useSettingsTabs";

export function SettingsTabBar({
  activeTab,
  onTabChange,
  dirtyTabs,
}: {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
  dirtyTabs: Set<SettingsTabId>;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-1 border-b border-gray-200">
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-current={isActive ? "page" : undefined}
              className={`flex-shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-accent text-gray-950"
                  : "border-transparent text-gray-600 hover:text-gray-950"
              }`}
            >
              {SETTINGS_TAB_LABELS[tab]}
              {dirtyTabs.has(tab) && (
                <span
                  aria-label="Unsaved changes"
                  className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
