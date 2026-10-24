"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TempLinkPanel from "@/components/crewAccess/TempLinkPanel";
import JoinCodesSection from "@/components/dashboard/sites/JoinCodesSection";

export type CrewAccessTab = "temp-link" | "crew-onboarding";

const TABS: { id: CrewAccessTab; label: string }[] = [
  { id: "temp-link", label: "Temporary clock-in link" },
  { id: "crew-onboarding", label: "Crew onboarding" },
];

// The tab lives in the URL (?tab=...) so each part can be linked to.
// Anything unknown falls back to the temp link tab.
export default function CrewAccessTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const active: CrewAccessTab = params.get("tab") === "crew-onboarding" ? "crew-onboarding" : "temp-link";

  function select(tab: CrewAccessTab) {
    router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  }

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Crew Access" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`crew-access-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`crew-access-panel-${tab.id}`}
              onClick={() => select(tab.id)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                selected ? "border-accent text-accent" : "border-transparent text-gray-600 hover:text-gray-950"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`crew-access-panel-${active}`}
        aria-labelledby={`crew-access-tab-${active}`}
        className="pt-6"
      >
        {active === "temp-link" ? <TempLinkPanel /> : <JoinCodesSection />}
      </div>
    </div>
  );
}
