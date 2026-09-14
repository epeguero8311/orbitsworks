"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { AlertActionRecord } from "@/lib/types";
import type { AlertItem } from "@/lib/dashboardOverviewUtils";

const LOOKBACK_DAYS = 30;

export function useAlertActions() {
  const { userData, currentUser } = useAuth();
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

  async function recordAlertAction(
    alert: AlertItem,
    status: "ignored" | "resolved",
    actionTaken?: "clockOut" | "editTime" | "endBreak"
  ) {
    if (!userData?.companyId || !currentUser) return;
    const actionsRef = collection(
      db,
      "companies",
      userData.companyId,
      "alertActions"
    );
    await addDoc(actionsRef, {
      alertKey: alert.key,
      alertType: alert.alertType,
      employeeId: alert.employeeId,
      status,
      ...(actionTaken ? { actionTaken } : {}),
      resolvedByUid: currentUser.uid,
      resolvedByName: currentUser.displayName || currentUser.email || "Admin",
      resolvedAt: serverTimestamp(),
    });
  }

  async function ignoreAlert(alert: AlertItem) {
    await recordAlertAction(alert, "ignored");
  }

  async function clockOutFromAlert(alert: AlertItem) {
    if (!alert.event || !userData?.companyId) return;
    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );
    await addDoc(eventsRef, {
      employeeId: alert.event.employeeId,
      employeeName: alert.event.employeeName,
      siteId: alert.event.siteId,
      siteName: alert.event.siteName,
      subcontractorId: alert.event.subcontractorId ?? null,
      subcontractorName: alert.event.subcontractorName ?? null,
      type: "out",
      source: "adminManual",
      note: "Clocked out from alert",
      createdByUid: currentUser?.uid,
      timestamp: Timestamp.fromDate(new Date()),
      createdAt: serverTimestamp(),
    });
    await recordAlertAction(alert, "resolved", "clockOut");
  }

  async function endBreakFromAlert(alert: AlertItem) {
    if (!alert.event || !userData?.companyId) return;
    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );
    await addDoc(eventsRef, {
      employeeId: alert.event.employeeId,
      employeeName: alert.event.employeeName,
      siteId: alert.event.siteId,
      siteName: alert.event.siteName,
      subcontractorId: alert.event.subcontractorId ?? null,
      subcontractorName: alert.event.subcontractorName ?? null,
      type: "breakEnd",
      source: "adminManual",
      note: "Break ended from alert",
      createdByUid: currentUser?.uid,
      timestamp: Timestamp.fromDate(new Date()),
      createdAt: serverTimestamp(),
    });
    await recordAlertAction(alert, "resolved", "endBreak");
  }

  async function submitEditTimeFromAlert(alert: AlertItem, chosenMs: number) {
    if (!alert.event || !userData?.companyId) return;
    if (!Number.isFinite(chosenMs)) {
      throw new Error("Invalid date/time.");
    }
    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );
    await addDoc(eventsRef, {
      employeeId: alert.event.employeeId,
      employeeName: alert.event.employeeName,
      siteId: alert.event.siteId,
      siteName: alert.event.siteName,
      subcontractorId: alert.event.subcontractorId ?? null,
      subcontractorName: alert.event.subcontractorName ?? null,
      type: "out",
      source: "adminManual",
      note: "Clock-out time set from alert",
      createdByUid: currentUser?.uid,
      timestamp: Timestamp.fromDate(new Date(chosenMs)),
      createdAt: serverTimestamp(),
    });
    await recordAlertAction(alert, "resolved", "editTime");
  }

  return {
    resolvedKeys,
    loading,
    ignoreAlert,
    clockOutFromAlert,
    endBreakFromAlert,
    submitEditTimeFromAlert,
  };
}