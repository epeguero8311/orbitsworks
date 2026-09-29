"use client";

import { useState } from "react";
import Link from "next/link";
import { doc, setDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { Pencil, Lock, Unlock, Check, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useDevices, type UnnamedDevice } from "@/lib/hooks/useDevices";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { deviceNameSchema, DEVICE_NAME_MAX_LENGTH } from "@/lib/validators/device";
import type { Device } from "@/lib/types";

interface DeviceRow {
  id: string;
  name: string | null;
  model: string;
  lastSeen: Timestamp | null;
  lastUsedByUid: string | null;
  locked: boolean;
  lockedByUid?: string;
  lockedAt?: Timestamp;
}

function buildRows(devices: Device[], unnamed: UnnamedDevice[]): DeviceRow[] {
  const named: DeviceRow[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    model: d.model || "-",
    lastSeen: d.lastSeenAt ?? null,
    lastUsedByUid: d.lastUserUid ?? null,
    locked: d.locked,
    lockedByUid: d.lockedByUid,
    lockedAt: d.lockedAt,
  }));
  named.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const unnamedRows: DeviceRow[] = unnamed.map((u) => ({
    id: u.deviceId,
    name: null,
    model: "-",
    lastSeen: u.lastSeen,
    lastUsedByUid: null,
    locked: false,
  }));
  unnamedRows.sort((a, b) => (b.lastSeen?.toMillis() ?? 0) - (a.lastSeen?.toMillis() ?? 0));

  return [...named, ...unnamedRows];
}

function formatLastSeen(ts: Timestamp | null): string {
  if (!ts) return "Never";
  return ts.toDate().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortDeviceId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

export function DevicesCard({ isPro }: { isPro: boolean }) {
  const { userData, currentUser } = useAuth();
  const { devices, unnamedDevices, loading, error } = useDevices();
  const { employees } = useEmployees();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftError, setDraftError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  if (!isPro) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-950">Devices</h2>
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm text-gray-600">Device recognition is a Pro feature.</p>
          <Link
            href="/dashboard/billing"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  const nameByUid = new Map(employees.map((e) => [e.id, e.name]));
  const rows = buildRows(devices, unnamedDevices);
  const isEmpty = error || rows.length === 0;

  const duplicateWarning =
    editingId != null && draftName.trim()
      ? devices.some(
          (d) => d.id !== editingId && d.name.trim().toLowerCase() === draftName.trim().toLowerCase()
        )
      : false;

  function startEditing(row: DeviceRow) {
    if (row.locked || savingId) return;
    setEditingId(row.id);
    setDraftName(row.name ?? "");
    setDraftError("");
  }

  function cancelEditing() {
    setEditingId(null);
    setDraftName("");
    setDraftError("");
  }

  async function commitEditing(row: DeviceRow) {
    if (!userData?.companyId || !currentUser) return;

    const result = deviceNameSchema.safeParse(draftName);
    if (!result.success) {
      setDraftError(result.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    const trimmed = result.data;

    setSavingId(row.id);
    try {
      const deviceRef = doc(db, "companies", userData.companyId, "devices", row.id);
      if (row.name === null) {
        // First time this deviceId is being named - creates the doc.
        // platform/model are left empty since the web admin naming it
        // from an unnamed clockEvent sighting has no way to know them.
        await setDoc(deviceRef, {
          name: trimmed,
          platform: "",
          model: "",
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(deviceRef, {
          name: trimmed,
          updatedAt: serverTimestamp(),
          updatedByUid: currentUser.uid,
        });
      }
      cancelEditing();
    } catch (err) {
      console.error("Failed to save device name:", err);
      setDraftError("Couldn't save. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleLock(row: DeviceRow) {
    if (!userData?.companyId || !currentUser || savingId) return;
    setSavingId(row.id);
    try {
      const deviceRef = doc(db, "companies", userData.companyId, "devices", row.id);
      await updateDoc(deviceRef, {
        locked: !row.locked,
        lockedByUid: currentUser.uid,
        lockedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to toggle device lock:", err);
    } finally {
      setSavingId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, row: DeviceRow) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEditing(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Devices</h2>
      <p className="mt-1 text-xs text-gray-600">
        Devices seen clocking in for this company. Rename them so Time Tracking shows who used
        which device.
      </p>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="mt-4 text-sm text-gray-600">
          No devices yet. Devices appear here after someone clocks in from the mobile app.
        </p>
      ) : (
        <div className="mt-4 w-full overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: "34%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">Device name</th>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 font-medium">Last seen</th>
                <th className="px-4 py-2.5 font-medium">Last used by</th>
                <th className="px-4 py-2.5 font-medium">Lock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = editingId === row.id;
                const isSaving = savingId === row.id;
                const lockedByName = row.lockedByUid ? nameByUid.get(row.lockedByUid) : undefined;
                const lastUsedByName = row.lastUsedByUid
                  ? nameByUid.get(row.lastUsedByUid) ?? "Unknown"
                  : "-";

                return (
                  <tr key={row.id} className="border-b border-gray-200 last:border-0">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              type="text"
                              maxLength={DEVICE_NAME_MAX_LENGTH}
                              value={draftName}
                              onChange={(e) => {
                                setDraftName(e.target.value);
                                setDraftError("");
                              }}
                              onKeyDown={(e) => handleKeyDown(e, row)}
                              disabled={isSaving}
                              className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-accent focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => commitEditing(row)}
                              disabled={isSaving}
                              aria-label="Save device name"
                              className="shrink-0 rounded-md p-1 text-green-700 hover:bg-green-50 disabled:opacity-50"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={isSaving}
                              aria-label="Cancel"
                              className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {draftError && <p className="mt-1 text-xs text-red-600">{draftError}</p>}
                          {!draftError && duplicateWarning && (
                            <p className="mt-1 text-xs text-amber-600">
                              Another device already has this name.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {row.name ? (
                            <span className="font-medium text-gray-950">{row.name}</span>
                          ) : (
                            <span className="text-gray-500">
                              Unnamed device ({shortDeviceId(row.id)})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => startEditing(row)}
                            disabled={row.locked}
                            aria-label="Rename device"
                            title={row.locked ? "Unlock to edit" : undefined}
                            className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {row.locked && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          Locked by {lockedByName ?? "Unknown"}
                          {row.lockedAt ? ` on ${formatLastSeen(row.lockedAt)}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.model}</td>
                    <td className="px-4 py-3 text-gray-600">{formatLastSeen(row.lastSeen)}</td>
                    <td className="px-4 py-3 text-gray-600">{lastUsedByName}</td>
                    <td className="px-4 py-3">
                      {row.name !== null && (
                        <button
                          type="button"
                          onClick={() => toggleLock(row)}
                          disabled={isSaving}
                          aria-label={row.locked ? "Unlock device" : "Lock device"}
                          title={row.locked ? "Unlock" : "Lock"}
                          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          {row.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
