"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { JobSite } from "@/lib/types";

export default function JobSitesPage() {
  const { userData } = useAuth();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;

    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );
    const q = query(sitesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSites(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<JobSite, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Job sites listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  async function handleAddSite(e: FormEvent) {
    e.preventDefault();
    if (!userData?.companyId) return;
    setError("");
    setIsSubmitting(true);

    try {
      const sitesRef = collection(
        db,
        "companies",
        userData.companyId,
        "jobSites"
      );
      await addDoc(sitesRef, {
        name: name.trim(),
        address: address.trim(),
        active: true,
        createdAt: serverTimestamp(),
      });
      setName("");
      setAddress("");
    } catch (err) {
      console.error("Add site error:", err);
      setError("Couldn't add the job site. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleActive(site: JobSite) {
    if (!userData?.companyId) return;
    const siteRef = doc(
      db,
      "companies",
      userData.companyId,
      "jobSites",
      site.id
    );
    await updateDoc(siteRef, { active: !site.active });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Job Sites</h1>
      <p className="mt-1 text-sm text-gray-600">
        Manage the locations employees can be assigned to.
      </p>

      {/* Add site form */}
      <form
        onSubmit={handleAddSite}
        className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label
            htmlFor="siteName"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Site name
          </label>
          <input
            id="siteName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="Downtown Warehouse"
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="siteAddress"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Address (optional)
          </label>
          <input
            id="siteAddress"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="123 Main St"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isSubmitting ? "Adding..." : "Add site"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Sites list */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-gray-600">Loading...</p>
        ) : sites.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No job sites yet. Add one above to get started.
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
              {sites.map((site) => (
                <tr key={site.id} className="border-b border-gray-200 last:border-0">
                  <td className="px-4 py-2.5 text-gray-950">{site.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {site.address || "-"}
                  </td>
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
                    <button
                      onClick={() => toggleActive(site)}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      {site.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
