"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { AlertActionRecord } from "@/lib/types";

const LOOKBACK_DAYS = 30;

export function useAlertActions() {
  const { userData } = useAuth();
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const actionsRef = collection(
      db,
      "companies",
      userData.companyId,
      "alertActions"
    );
    const q = query(actionsRef, where("resolvedAt", ">=", Timestamp.fromDate(cutoff)));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const keys = new Set<string>();
        snapshot.docs.forEach((d) => {
          const data = d.data() as Omit<AlertActionRecord, "id">;
          if (data.alertKey) keys.add(data.alertKey);
        });
        setResolvedKeys(keys);
        setLoading(false);
      },
      (err) => {
        console.error("Alert actions listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  return { resolvedKeys, loading };
}