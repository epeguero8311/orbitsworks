"use client";

import { useState, FormEvent } from "react";
import { useSites } from "@/lib/hooks/useSites";
import type { JobSite } from "@/lib/types";

export default function SitesSection() {
  const {
    sites,
    loading: sitesLoading,
    addSite,
    updateSite,
    toggleSiteActive,
    deleteSite,
  } = useSites();

  const sortedSites = [...sites].sort(
    (a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0)
  );

  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [isSubmittingSite, setIsSubmittingSite] = useState(false);
  const [siteError, setSiteError] = useState("");

  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteAddress, setEditSiteAddress] = useState("");
  const [editSiteError, setEditSiteError] = useState("");
  const [confirmingDeleteSite, setConfirmingDeleteSite] = useState(false);

  async function handleAddSite(e: FormEvent) {
    e.preventDefault();
    setSiteError("");
    setIsSubmittingSite(true);

    try {
      await addSite(siteName, siteAddress);
      setSiteName("");
      setSiteAddress("");
    } catch (err) {
      console.error("Add site error:", err);
      setSiteError("Couldn't add the site. Try again.");
    } finally {
      setIsSubmittingSite(false);
    }
  }

  function startEditSite(site: JobSite) {
    setEditingSiteId(site.id);
    setEditSiteName(site.name);
    setEditSiteAddress(site.address ?? "");
    setEditSiteError("");
    setConfirmingDeleteSite(false);
  }

  function cancelEditSite() {
    setEditingSiteId(null);
    setEditSiteError("");
    setConfirmingDeleteSite(false);
  }

  async function saveEditSite(site: JobSite) {
    if (!editSiteName.trim()) {
      setEditSiteError("Site name can't be empty.");
      return;
    }

    try {
      await updateSite(site.id, editSiteName, editSiteAddress);
      setEditingSiteId(null);
      setEditSiteError("");
    } catch (err) {
      console.error("Edit site error:", err);
      setEditSiteError("Couldn't save changes. Try again.");
    }
  }

  async function handleDeleteSite(site: JobSite) {
    try {
      await deleteSite(site.id);
      setEditingSiteId(null);
      setConfirmingDeleteSite(false);
    } catch (err) {
      console.error("Delete site error:", err);
      setEditSiteError("Couldn't delete the site. Try again.");
      setConfirmingDeleteSite(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-gray-950">Sites</h2>
      <p className="mt-1 text-sm text-gray-600">
        The locations employees can be assigned to.
      </p>

      <form
        onSubmit={handleAddSite}
        className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="siteName" className="mb-1.5 block text-sm font-medium text-gray-950">
            Site name
          </label>
          <input
            id="siteName"
            type="text"
            required
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Downtown Warehouse"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="siteAddress" className="mb-1.5 block text-sm font-medium text-gray-950">
            Address (optional)
          </label>
          <input
            id="siteAddress"
            type="text"
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="123 Main St"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmittingSite}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isSubmittingSite ? "Adding..." : "Add site"}
        </button>
      </form>
      {siteError && <p className="mt-2 text-sm text-red-600">{siteError}</p>}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {sitesLoading ? (
          <p className="p-4 text-sm text-gray-600">Loading...</p>
        ) : sites.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No sites yet. Add one above to get started.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sortedSites.map((site) => {
                const isEditing = editingSiteId === site.id;
                return (
                  <tr key={site.id} className="border-b border-gray-200 last:border-0">
                    {isEditing ? (
                      <>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={editSiteName}
                            onChange={(e) => setEditSiteName(e.target.value)}
                            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={editSiteAddress}
                            onChange={(e) => setEditSiteAddress(e.target.value)}
                            placeholder="Address (optional)"
                            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          />
                        </td>
                        <td className="px-4 py-2.5" colSpan={2}>
                          {confirmingDeleteSite ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-red-700">
                                Delete this site? This can&apos;t be undone.
                              </span>
                              <button
                                onClick={() => handleDeleteSite(site)}
                                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteSite(false)}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {editSiteError && (
                                <span className="text-xs text-red-600">{editSiteError}</span>
                              )}
                              <button
                                onClick={() => saveEditSite(site)}
                                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditSite}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteSite(true)}
                                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-gray-950">{site.name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{site.address || "-"}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              site.active
                                ? "bg-green-50 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {site.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => startEditSite(site)}
                              className="text-sm font-medium text-accent hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleSiteActive(site)}
                              className="text-sm font-medium text-accent hover:underline"
                            >
                              {site.active ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
