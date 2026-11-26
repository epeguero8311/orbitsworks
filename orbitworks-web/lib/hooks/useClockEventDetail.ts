"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuth, isAdminOrOwner } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { ClockEvent } from "@/lib/types";
import {
  effectiveDate,
  toDatetimeLocalValue,
} from "@/lib/clockEventDetailUtils";
import { findSession } from "@/lib/clockPairing";
import { reviewCorrection, type CorrectionNeighbours } from "@/lib/clockCorrection";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";

// A correction waiting for the admin's confirm (same two-step as reassign).
export interface PendingCorrection {
  target: ClockEvent;
  oldMs: number;
  newMs: number;
  reason: string;
  neighbours: CorrectionNeighbours;
}

export function useClockEventDetail({
  event,
  allEvents,
}: {
  event: ClockEvent;
  allEvents: ClockEvent[];
}) {
  const { userData } = useAuth();
  const isAdmin = isAdminOrOwner(userData?.role);
  const { employees } = useEmployees();

  const liveEvent = allEvents.find((e) => e.id === event.id) ?? event;

  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [newTimeValue, setNewTimeValue] = useState("");
  const [reasonValue, setReasonValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHistoryId, setShowHistoryId] = useState<string | null>(null);
  const [pendingCorrection, setPendingCorrection] = useState<PendingCorrection | null>(null);

  const [pendingNewEmployeeId, setPendingNewEmployeeId] = useState<string | null>(null);
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const { clockInEvent, clockOutEvent } = findSession(allEvents, liveEvent.id);

  const dayDate = effectiveDate(liveEvent);
  const dayLabel = dayDate
    ? dayDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown date";

  const activeEmployees = employees.filter((e) => e.active);
  // Employee App "Delete account" - tags this employee's clock events.
  const appAccountDeleted = !!employees.find((e) => e.id === liveEvent.employeeId)?.appAccountDeletedAt;
  const pendingEmployeeName = pendingNewEmployeeId
    ? activeEmployees.find((e) => e.id === pendingNewEmployeeId)?.name ??
      "Unknown"
    : null;

  function handleStartAdjust(target: ClockEvent) {
    const d = effectiveDate(target);
    setNewTimeValue(d ? toDatetimeLocalValue(d) : "");
    setReasonValue("");
    setErrorMsg(null);
    setAdjustingId(target.id);
  }

  function handleCancelAdjust() {
    setPendingCorrection(null);
    setAdjustingId(null);
    setNewTimeValue("");
    setReasonValue("");
    setErrorMsg(null);
  }

  // Step 1 ("Save correction"): check the new time against the events this
  // page has loaded and show the confirm. Nothing is saved yet.
  function handleSubmitAdjust(target: ClockEvent) {
    if (!newTimeValue) return;
    setErrorMsg(null);
    const review = reviewCorrection(target, allEvents, new Date(newTimeValue).getTime(), reasonValue);
    if (!review.ok) {
      setErrorMsg(review.error);
      return;
    }
    setPendingCorrection({ target, oldMs: review.oldMs, newMs: review.newMs, reason: reasonValue.trim(), neighbours: review.neighbours });
  }

  // Back to editing the time, keeping what was typed.
  function handleCancelCorrection() {
    setPendingCorrection(null);
  }

  // Step 2 ("Confirm"): the server checks the order again against the
  // employee's full history and saves.
  async function handleConfirmCorrection() {
    if (!pendingCorrection) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const correctClockEventFn = httpsCallable(functions, "correctClockEvent");
      await correctClockEventFn({
        eventId: pendingCorrection.target.id,
        newTimestamp: pendingCorrection.newMs,
        ...(pendingCorrection.reason ? { reason: pendingCorrection.reason } : {}),
      });
      setPendingCorrection(null);
      setAdjustingId(null);
      setNewTimeValue("");
      setReasonValue("");
    } catch (err) {
      setPendingCorrection(null);
      if (toastIfPermissionDenied(err, { action: "edit time", permission: "approveHours" })) return;
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save correction."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handlePickReassign(newEmployeeId: string) {
    if (!newEmployeeId || newEmployeeId === liveEvent.employeeId) return;
    setPendingNewEmployeeId(newEmployeeId);
    setReassignError(null);
  }

  function handleCancelReassign() {
    setPendingNewEmployeeId(null);
    setReassignError(null);
  }

  async function handleConfirmReassign() {
    if (!pendingNewEmployeeId) return;
    setReassignSubmitting(true);
    setReassignError(null);
    try {
      const reassignClockEventFn = httpsCallable(functions, "reassignClockEvent");
      await reassignClockEventFn({
        eventId: liveEvent.id,
        newEmployeeId: pendingNewEmployeeId,
      });
      setPendingNewEmployeeId(null);
    } catch (err) {
      if (toastIfPermissionDenied(err, { action: "reassign clock events", permission: "approveHours" })) return;
      setReassignError(
        err instanceof Error ? err.message : "Failed to reassign this event."
      );
    } finally {
      setReassignSubmitting(false);
    }
  }

  return {
    isAdmin,
    liveEvent,
    clockInEvent,
    clockOutEvent,
    dayLabel,
    activeEmployees,
    appAccountDeleted,
    pendingEmployeeName,
    // adjust
    adjustingId,
    newTimeValue,
    setNewTimeValue,
    reasonValue,
    setReasonValue,
    submitting,
    errorMsg,
    showHistoryId,
    setShowHistoryId,
    handleStartAdjust,
    handleCancelAdjust,
    handleSubmitAdjust,
    pendingCorrection,
    handleCancelCorrection,
    handleConfirmCorrection,
    // reassign
    pendingNewEmployeeId,
    reassignSubmitting,
    reassignError,
    handlePickReassign,
    handleCancelReassign,
    handleConfirmReassign,
  };
}
