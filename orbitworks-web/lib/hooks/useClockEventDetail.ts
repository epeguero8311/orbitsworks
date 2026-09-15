"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { ClockEvent } from "@/lib/types";
import {
  effectiveDate,
  findPairedEvent,
  toDatetimeLocalValue,
} from "@/lib/clockEventDetailUtils";

export function useClockEventDetail({
  event,
  allEvents,
}: {
  event: ClockEvent;
  allEvents: ClockEvent[];
}) {
  const { userData } = useAuth();
  const isAdmin = userData?.role === "admin";
  const { employees } = useEmployees();

  const liveEvent = allEvents.find((e) => e.id === event.id) ?? event;

  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [newTimeValue, setNewTimeValue] = useState("");
  const [reasonValue, setReasonValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHistoryId, setShowHistoryId] = useState<string | null>(null);

  const [pendingNewEmployeeId, setPendingNewEmployeeId] = useState<string | null>(null);
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const pair = findPairedEvent(liveEvent, allEvents);
  const clockInEvent = liveEvent.type === "in" ? liveEvent : pair;
  const clockOutEvent = liveEvent.type === "out" ? liveEvent : pair;

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
    setAdjustingId(null);
    setNewTimeValue("");
    setReasonValue("");
    setErrorMsg(null);
  }

  async function handleSubmitAdjust(target: ClockEvent) {
    if (!newTimeValue) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const newTimestampMs = new Date(newTimeValue).getTime();
      if (!Number.isFinite(newTimestampMs)) {
        throw new Error("Invalid date/time.");
      }
      const correctClockEventFn = httpsCallable(functions, "correctClockEvent");
      await correctClockEventFn({
        eventId: target.id,
        newTimestamp: newTimestampMs,
        ...(reasonValue.trim() ? { reason: reasonValue.trim() } : {}),
      });
      setAdjustingId(null);
      setNewTimeValue("");
      setReasonValue("");
    } catch (err) {
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
    // reassign
    pendingNewEmployeeId,
    reassignSubmitting,
    reassignError,
    handlePickReassign,
    handleCancelReassign,
    handleConfirmReassign,
  };
}
