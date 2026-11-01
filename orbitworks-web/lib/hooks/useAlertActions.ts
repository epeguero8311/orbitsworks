"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { AlertActionRecord } from "@/lib/types";
import { ALERT_ACTION_LOOKBACK_DAYS, type AlertItem } from "@/lib/dashboardOverviewUtils";

const LOOKBACK_DAYS = ALERT_ACTION_LOOKBACK_DAYS;

// Firestore's limit on writes in one batch.
const MAX_BATCH_WRITES = 500;

export function useAlertActions() {
  const { userData, currentUser } = useAuth();
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  // Keys Ignore all has hidden but the server hasn't confirmed yet. The
  // listener below only sees a record once the server has stamped its
  // resolvedAt, so without this every alert would wait for the save.
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const resolvedKeys = useMemo(() => {
    if (pendingKeys.size === 0) return savedKeys;
    const all = new Set(savedKeys);
    pendingKeys.forEach((k) => all.add(k));
    return all;
  }, [savedKeys, pendingKeys]);

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
        setSavedKeys(keys);
        // Once the server has confirmed a hidden key, the saved set covers
        // it - stop tracking it as pending.
        setPendingKeys((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set([...prev].filter((k) => !keys.has(k)));
          return next.size === prev.size ? prev : next;
        });
        setLoading(false);
      },
      (err) => {
        console.error("Alert actions listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  // One alertActions record - the same fields whether it's written alone
  // (recordAlertAction) or as part of Ignore all's batch.
  function alertActionRecord(
    alert: AlertItem,
    status: "ignored" | "resolved",
    actionTaken?: "clockOut" | "editTime" | "endBreak" | "confirmedMatch"
  ) {
    return {
      alertKey: alert.key,
      alertType: alert.alertType,
      employeeId: alert.employeeId,
      status,
      ...(actionTaken ? { actionTaken } : {}),
      resolvedByUid: currentUser!.uid,
      resolvedByName: currentUser!.displayName || currentUser!.email || "Admin",
      resolvedAt: serverTimestamp(),
    };
  }

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
    await addDoc(actionsRef, alertActionRecord(alert, status, actionTaken));
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

  // Dismisses every alert currently visible in one action. Writes the same
  // per-alert records ignoreAlert does (one alertActions doc per key, same
  // fields), so history and the date/week-scoped keys work unchanged and a
  // newly generated alert (a key not in this list) still shows up normally.
  //
  // All of them are hidden at once, right away, and saved in one batch -
  // all or nothing: if it fails, none are ignored and they all come back.
  // Past Firestore's 500-writes-per-batch limit (rare) the list is saved in
  // back-to-back batches; a batch that fails brings back its alerts and
  // every later batch's, and earlier batches stay ignored.
  async function ignoreAll(alerts: AlertItem[]) {
    if (!userData?.companyId || !currentUser || alerts.length === 0) return;
    const companyId = userData.companyId;
    const keys = alerts.map((a) => a.key);
    setPendingKeys((prev) => new Set([...prev, ...keys]));

    for (let start = 0; start < alerts.length; start += MAX_BATCH_WRITES) {
      const chunk = alerts.slice(start, start + MAX_BATCH_WRITES);
      const batch = writeBatch(db);
      for (const alert of chunk) {
        batch.set(doc(collection(db, "companies", companyId, "alertActions")), alertActionRecord(alert, "ignored"));
      }
      try {
        await batch.commit();
      } catch (err) {
        const unsaved = new Set(keys.slice(start));
        setPendingKeys((prev) => new Set([...prev].filter((k) => !unsaved.has(k))));
        throw err;
      }
    }
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