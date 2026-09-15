"use client";

import type { JobSite } from "@/lib/types";

export function EmployeeSitesField({
  sites,
  selectedSiteIds,
  onToggleSite,
}: {
  sites: JobSite[];
  selectedSiteIds: string[];
  onToggleSite: (siteId: string) => void;
}) {
  return (
    <div className="mt-5">
      <span className="mb-2 block text-sm font-medium text-gray-950">
        Assigned job sites
      </span>
      {sites.length === 0 ? (
        <p className="text-sm text-gray-600">No active job sites yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sites.map((site) => (
            <label
              key={site.id}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                selectedSiteIds.includes(site.id)
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={selectedSiteIds.includes(site.id)}
                onChange={() => onToggleSite(site.id)}
              />
              {site.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
