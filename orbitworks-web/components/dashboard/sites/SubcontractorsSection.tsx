"use client";

import { useState, FormEvent } from "react";
import { useSubcontractors } from "@/lib/hooks/useSubcontractors";
import type { Subcontractor } from "@/lib/types";

export default function SubcontractorsSection() {
  const {
    subcontractors,
    loading: subcontractorsLoading,
    addSubcontractor,
    updateSubcontractor,
    toggleSubcontractorActive,
    deleteSubcontractor,
  } = useSubcontractors();

  const sortedSubcontractors = [...subcontractors].sort(
    (a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0)
  );

  const [subName, setSubName] = useState("");
  const [subContactName, setSubContactName] = useState("");
  const [subEmail, setSubEmail] = useState("");
  const [subPhone, setSubPhone] = useState("");
  const [subAddress, setSubAddress] = useState("");
  const [isSubmittingSub, setIsSubmittingSub] = useState(false);
  const [subError, setSubError] = useState("");

  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubName, setEditSubName] = useState("");
  const [editSubContactName, setEditSubContactName] = useState("");
  const [editSubEmail, setEditSubEmail] = useState("");
  const [editSubPhone, setEditSubPhone] = useState("");
  const [editSubAddress, setEditSubAddress] = useState("");
  const [editSubError, setEditSubError] = useState("");
  const [confirmingDeleteSub, setConfirmingDeleteSub] = useState(false);

  async function handleAddSubcontractor(e: FormEvent) {
    e.preventDefault();
    setSubError("");
    setIsSubmittingSub(true);

    try {
      await addSubcontractor({
        name: subName,
        contactName: subContactName,
        email: subEmail,
        phone: subPhone,
        address: subAddress,
      });
      setSubName("");
      setSubContactName("");
      setSubEmail("");
      setSubPhone("");
      setSubAddress("");
    } catch (err) {
      console.error("Add subcontractor error:", err);
      setSubError("Couldn't add the subcontractor. Try again.");
    } finally {
      setIsSubmittingSub(false);
    }
  }

  function startEditSub(subcontractor: Subcontractor) {
    setEditingSubId(subcontractor.id);
    setEditSubName(subcontractor.name);
    setEditSubContactName(subcontractor.contactName ?? "");
    setEditSubEmail(subcontractor.email ?? "");
    setEditSubPhone(subcontractor.phone ?? "");
    setEditSubAddress(subcontractor.address ?? "");
    setEditSubError("");
    setConfirmingDeleteSub(false);
  }

  function cancelEditSub() {
    setEditingSubId(null);
    setEditSubError("");
    setConfirmingDeleteSub(false);
  }

  async function saveEditSub(subcontractor: Subcontractor) {
    if (!editSubName.trim()) {
      setEditSubError("Company name can't be empty.");
      return;
    }

    try {
      await updateSubcontractor(subcontractor.id, {
        name: editSubName,
        contactName: editSubContactName,
        email: editSubEmail,
        phone: editSubPhone,
        address: editSubAddress,
      });
      setEditingSubId(null);
      setEditSubError("");
    } catch (err) {
      console.error("Edit subcontractor error:", err);
      setEditSubError("Couldn't save changes. Try again.");
    }
  }

  async function handleDeleteSub(subcontractor: Subcontractor) {
    try {
      await deleteSubcontractor(subcontractor.id);
      setEditingSubId(null);
      setConfirmingDeleteSub(false);
    } catch (err) {
      console.error("Delete subcontractor error:", err);
      setEditSubError("Couldn't delete the subcontractor. Try again.");
      setConfirmingDeleteSub(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold text-gray-950">Subcontractors</h2>
      <p className="mt-1 text-sm text-gray-600">
        Companies you subcontract workers from. Assign employees to a
        subcontractor from the Employees page - payroll and Excel exports
        split out into a separate sheet per subcontractor.
      </p>

      <form
        onSubmit={handleAddSubcontractor}
        className="mt-4 rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="subName" className="mb-1.5 block text-sm font-medium text-gray-950">
              Company name
            </label>
            <input
              id="subName"
              type="text"
              required
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="Spotless Cleaning Co."
            />
          </div>
          <div>
            <label htmlFor="subContactName" className="mb-1.5 block text-sm font-medium text-gray-950">
              Contact name (optional)
            </label>
            <input
              id="subContactName"
              type="text"
              value={subContactName}
              onChange={(e) => setSubContactName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="Maria Lopez"
            />
          </div>
          <div>
            <label htmlFor="subEmail" className="mb-1.5 block text-sm font-medium text-gray-950">
              Email (optional)
            </label>
            <input
              id="subEmail"
              type="email"
              value={subEmail}
              onChange={(e) => setSubEmail(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="payroll@spotless.com"
            />
          </div>
          <div>
            <label htmlFor="subPhone" className="mb-1.5 block text-sm font-medium text-gray-950">
              Phone (optional)
            </label>
            <input
              id="subPhone"
              type="text"
              value={subPhone}
              onChange={(e) => setSubPhone(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="(504) 555-0142"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="subAddress" className="mb-1.5 block text-sm font-medium text-gray-950">
              Address (optional)
            </label>
            <input
              id="subAddress"
              type="text"
              value={subAddress}
              onChange={(e) => setSubAddress(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="123 Main St"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmittingSub}
          className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isSubmittingSub ? "Adding..." : "Add subcontractor"}
        </button>
      </form>
      {subError && <p className="mt-2 text-sm text-red-600">{subError}</p>}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {subcontractorsLoading ? (
          <p className="p-4 text-sm text-gray-600">Loading...</p>
        ) : subcontractors.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No subcontractors yet. Add one above to get started.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sortedSubcontractors.map((sub) => {
                const isEditing = editingSubId === sub.id;
                return (
                  <tr key={sub.id} className="border-b border-gray-200 last:border-0">
                    {isEditing ? (
                      <>
                        <td className="px-4 py-2.5 align-top">
                          <input
                            type="text"
                            value={editSubName}
                            onChange={(e) => setEditSubName(e.target.value)}
                            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          />
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={editSubContactName}
                              onChange={(e) => setEditSubContactName(e.target.value)}
                              placeholder="Contact name"
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                            <input
                              type="email"
                              value={editSubEmail}
                              onChange={(e) => setEditSubEmail(e.target.value)}
                              placeholder="Email"
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                            <input
                              type="text"
                              value={editSubPhone}
                              onChange={(e) => setEditSubPhone(e.target.value)}
                              placeholder="Phone"
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                            <input
                              type="text"
                              value={editSubAddress}
                              onChange={(e) => setEditSubAddress(e.target.value)}
                              placeholder="Address"
                              className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 align-top" colSpan={2}>
                          {confirmingDeleteSub ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-red-700">
                                Delete this subcontractor? This can&apos;t be undone.
                              </span>
                              <button
                                onClick={() => handleDeleteSub(sub)}
                                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteSub(false)}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {editSubError && (
                                <span className="text-xs text-red-600">{editSubError}</span>
                              )}
                              <button
                                onClick={() => saveEditSub(sub)}
                                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditSub}
                                className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-950 hover:border-gray-300"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteSub(true)}
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
                        <td className="px-4 py-2.5 align-top text-gray-950">{sub.name}</td>
                        <td className="px-4 py-2.5 align-top text-gray-600">
                          <div className="space-y-0.5 text-xs">
                            {sub.contactName && <p>{sub.contactName}</p>}
                            {sub.email && <p>{sub.email}</p>}
                            {sub.phone && <p>{sub.phone}</p>}
                            {!sub.contactName && !sub.email && !sub.phone && <p>-</p>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              sub.active
                                ? "bg-green-50 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {sub.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-top text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => startEditSub(sub)}
                              className="text-sm font-medium text-accent hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleSubcontractorActive(sub)}
                              className="text-sm font-medium text-accent hover:underline"
                            >
                              {sub.active ? "Deactivate" : "Reactivate"}
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
