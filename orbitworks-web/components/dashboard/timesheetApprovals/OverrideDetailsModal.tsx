"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { OverrideEvent } from "@/lib/types";

const ACTION_LABEL: Record<OverrideEvent["action"], string> = {
  in: "Clock in",
  out: "Clock out",
  breakStart: "Start break",
  breakEnd: "End break",
};

export default function OverrideDetailsModal({
  overrideEventId,
  onClose,
}: {
  overrideEventId: string;
  onClose: () => void;
}) {
  const { userData } = useAuth();
  const [overrideEvent, setOverrideEvent] = useState<OverrideEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;
    let cancelled = false;

    async function load() {
      try {
        const ref = doc(
          db,
          "companies",
          userData!.companyId,
          "overrideEvents",
          overrideEventId
        );
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (snap.exists()) {
          setOverrideEvent({ id: snap.id, ...(snap.data() as Omit<OverrideEvent, "id">) });
        } else {
          setError("This override record couldn't be found.");
        }
      } catch (err) {
        console.error("Override event fetch error:", err);
        if (!cancelled) setError("Couldn't load override details. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userData?.companyId, overrideEventId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-950">
          Supervisor override
        </h2>

        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Loading...</p>
        ) : error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : overrideEvent ? (
          <div className="mt-3 space-y-2.5 rounded-lg bg-amber-50 p-3.5 text-sm">
            <div>
              <p className="text-xs font-medium text-gray-600">Authorized by</p>
              <p className="text-gray-950">{overrideEvent.supervisorName ?? "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600">Action</p>
              <p className="text-gray-950">{ACTION_LABEL[overrideEvent.action]}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600">Reason</p>
              <p className="text-gray-950">{overrideEvent.reason}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600">Recorded</p>
              <p className="text-gray-950">
                {overrideEvent.createdAt
                  ? overrideEvent.createdAt.toDate().toLocaleString()
                  : "-"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
