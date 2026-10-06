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
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { AlertActionRecord } from "@/lib/types";
import { ALERT_ACTION_LOOKBACK_DAYS, type AlertItem } from "@/lib/dashboardOverviewUtils";

const LOOKBACK_DAYS = ALERT_ACTION_LOOKBACK_DAYS;

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
    actionTaken?: "clockOut" | "editTime" | "endBreak" | "confirmedMatch"
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

  // Face Verification (Pro) "Confirmed it's them" - a resolve with no
  // underlying clock event write (unlike clockOut/editTime/endBreak,
  // which all create or adjust one). Shared by faceMismatch and
  // faceNoFace - both are "someone should confirm this was really them"
  // flags, not a time-correction need.
  async function confirmFaceMatchFromAlert(alert: AlertItem) {
    await recordAlertAction(alert, "resolved", "confirmedMatch");
  }

  // Dismisses every alert currently visible in one go. Reuses the same
  // per-alert persistence ignoreAlert already writes (one alertActions doc
  // per key) rather than a separate dismissal mechanism, so a newly
  // generated alert (a key not in this list) still shows up normally.
  async function ignoreAll(alerts: AlertItem[]) {
    await Promise.all(alerts.map((alert) => recordAlertAction(alert, "ignored")));
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
      authorizedById: currentUser?.uid,
      authorizedByName: currentUser?.displayName || currentUser?.email || "Admin",
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
      authorizedById: currentUser?.uid,
      authorizedByName: currentUser?.displayName || currentUser?.email || "Admin",
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
      authorizedById: currentUser?.uid,
      authorizedByName: currentUser?.displayName || currentUser?.email || "Admin",
      timestamp: Timestamp.fromDate(new Date(chosenMs)),
      createdAt: serverTimestamp(),
    });
    await recordAlertAction(alert, "resolved", "editTime");
  }

  // Geofencing (Pro) Part 4 - unlike submitEditTimeFromAlert above (which
  // always creates a fresh clock-OUT to close an open session), this
  // alert's underlying event is the clock-IN itself, and that clock-in may
  // already be closed out normally. Creating another "out" event would be
  // wrong here - sometimes flatly incorrect (duplicating/overriding an
  // already-correct clock-out), sometimes nonsensical (the employee may
  // have clocked out hours ago for an unrelated reason). Corrects the
  // flagged event's own timestamp instead, via the same admin-only
  // mechanism EventSide.tsx's "Adjust time" already uses.
  async function editClockInTimeFromAlert(alert: AlertItem, chosenMs: number) {
    if (!alert.event) return;
    if (!Number.isFinite(chosenMs)) {
      throw new Error("Invalid date/time.");
    }
    const correctClockEventFn = httpsCallable(functions, "correctClockEvent");
    await correctClockEventFn({
      eventId: alert.event.id,
      newTimestamp: chosenMs,
    });
    await recordAlertAction(alert, "resolved", "editTime");
  }

  return {
    resolvedKeys,
    loading,
    ignoreAlert,
    ignoreAll,
    confirmFaceMatchFromAlert,
    clockOutFromAlert,
    endBreakFromAlert,
    submitEditTimeFromAlert,
    editClockInTimeFromAlert,
  };
}