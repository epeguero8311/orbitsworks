"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { fetchShiftData, SERVER_REFRESH_MS } from "@/lib/shiftData";
import type { SiteExit } from "@/lib/types";

// Phase 9 (H8 a): live-listens to the job site exits that STARTED in a
// time range (startMs, phone time - the Overview card asks for today).
// Single-field range + orderBy on startMs: no composite index. Staff read
// rule (firestore.rules siteExits). State set only in the callbacks.
// -> { exits (newest first), loading, error }
type Loaded = { key: string; exits: SiteExit[]; error: string };

export function useSiteExitsByRange(companyId: string | undefined, startMs: number, endMs: number) {
  const key = `${companyId ?? ""}|${startMs}|${endMs}`;
  const [loaded, setLoaded] = useState<Loaded>({ key: "", exits: [], error: "" });
  // Task 4 (D13): Overview is unfiltered; a restricted admin gets it from
  // the server ("overview" = every site, recent window), refreshed every 30 s.
  const { serverReads } = useAdminAccess();

  useEffect(() => {
    if (!companyId) return;
    const myKey = `${companyId}|${startMs}|${endMs}`;
    if (serverReads) {
      let cancelled = false;
      const load = () =>
        fetchShiftData({ purpose: "overview", startMs, endMs, want: { siteExits: true } })
          .then((res) => {
            if (cancelled) return;
            const exits = res.siteExits
              .map((d) => ({ id: d.id, ...(d.data() as Omit<SiteExit, "id">) }))
              .sort((a, b) => b.startMs - a.startMs);
            setLoaded({ key: myKey, exits, error: "" });
          })
          .catch((err) => {
            console.error("Site exits by range server load error:", err);
            if (!cancelled) setLoaded({ key: myKey, exits: [], error: "Couldn't load job site exits." });
          });
      load();
      const timer = setInterval(load, SERVER_REFRESH_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }
    const q = query(
      collection(db, "companies", companyId, "siteExits"),
      where("startMs", ">=", startMs),
      where("startMs", "<=", endMs),
      orderBy("startMs", "desc")
    );
    return onSnapshot(
      q,
      (snap) => setLoaded({ key: myKey, exits: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteExit, "id">) })), error: "" }),
      (err) => {
        console.error("Site exits by range listener error:", err);
        setLoaded({ key: myKey, exits: [], error: "Couldn't load job site exits." });
      }
    );
  }, [companyId, startMs, endMs, serverReads]);

  const current = loaded.key === key ? loaded : { key, exits: [], error: "" };
  return { exits: current.exits, loading: loaded.key !== key, error: current.error };
}
