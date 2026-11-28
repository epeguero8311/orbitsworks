"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ClockEvent } from "@/lib/types";

// How far back the live clock-status listeners read (Overview, Time
// Tracking's clock form). They used to read the newest N events (200 / 50),
// which silently dropped people once more than ~N were on the clock - a
// 350-person crew showed 195 clocked in. A time window has no head-count
// ceiling; the backfill below covers open shifts that started before it.
export const STATUS_WINDOW_MS = 2 * 86400000;

const OPEN_TYPES = ["in", "breakStart", "breakEnd"];
// Enough for one long shift with several breaks (+ corrections).
const EVENTS_PER_OPEN_SESSION = 20;
const FETCH_CONCURRENCY = 10;

// Employees whose server-kept status (employees/{id}.lastEventType, written
// by onClockEventCreated - the same field the mobile apps read) says they're
// on the clock, but whose clock-in isn't inside `windowEvents`: e.g. a missed
// clock-out from last week. Returns their latest events so the caller still
// derives status / worked time from the events themselves.
//
// Only for callers that read clock events directly (owner, all-sites
// admins). Restricted admins get their window from the server (serverReads).
export function useOpenSessionBackfill(
  companyId: string | undefined,
  windowEvents: ClockEvent[],
  enabled: boolean
): ClockEvent[] {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [fetched, setFetched] = useState<ClockEvent[]>([]);

  useEffect(() => {
    if (!companyId || !enabled) return;
    const q = query(
      collection(db, "companies", companyId, "employees"),
      where("lastEventType", "in", OPEN_TYPES)
    );
    return onSnapshot(
      q,
      (snap) => setOpenIds(snap.docs.map((d) => d.id).sort()),
      (err) => console.error("Open sessions listener error:", err)
    );
  }, [companyId, enabled]);

  // Open employees with no clock-in inside the window.
  const missing = useMemo(() => {
    if (!enabled) return [] as string[];
    const hasClockIn = new Set(
      windowEvents.filter((e) => e.type === "in").map((e) => e.employeeId)
    );
    return openIds.filter((id) => !hasClockIn.has(id));
  }, [enabled, openIds, windowEvents]);
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!companyId || !missingKey) return;
    let cancelled = false;
    const ids = missingKey.split(",");
    (async () => {
      const out: ClockEvent[] = [];
      for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
        const snaps = await Promise.all(
          ids.slice(i, i + FETCH_CONCURRENCY).map((id) =>
            getDocs(
              query(
                collection(db, "companies", companyId, "clockEvents"),
                where("employeeId", "==", id),
                orderBy("timestamp", "desc"),
                limit(EVENTS_PER_OPEN_SESSION)
              )
            )
          )
        );
        for (const s of snaps) {
          for (const d of s.docs) {
            out.push({ id: d.id, ...(d.data() as Omit<ClockEvent, "id">) });
          }
        }
      }
      if (!cancelled) setFetched(out);
    })().catch((err) => console.error("Open sessions backfill error:", err));
    return () => {
      cancelled = true;
    };
  }, [companyId, missingKey]);

  // Only what's still missing (a later fetch replaces it; nothing flickers
  // while one is in flight).
  return useMemo(() => {
    const want = new Set(missing);
    return fetched.filter((e) => want.has(e.employeeId));
  }, [fetched, missing]);
}

// windowEvents + backfill, without duplicates.
export function mergeEvents(windowEvents: ClockEvent[], extra: ClockEvent[]): ClockEvent[] {
  if (extra.length === 0) return windowEvents;
  const seen = new Set(windowEvents.map((e) => e.id));
  return [...windowEvents, ...extra.filter((e) => !seen.has(e.id))];
}
