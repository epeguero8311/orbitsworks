"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

  useEffect(() => {
    if (!companyId) return;
    const myKey = `${companyId}|${startMs}|${endMs}`;
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
  }, [companyId, startMs, endMs]);

  const current = loaded.key === key ? loaded : { key, exits: [], error: "" };
  return { exits: current.exits, loading: loaded.key !== key, error: current.error };
}
