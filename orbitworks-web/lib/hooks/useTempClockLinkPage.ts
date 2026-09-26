"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useSites } from "@/lib/hooks/useSites";
import { isProPlan } from "@/lib/stripe/tiers";

export type TempLinkDuration = 10 | 30 | 60;

export interface ActiveTempLink {
  token: string;
  siteId: string | null;
  siteName: string;
  createdByName: string;
  expiresAt: number;
  durationMinutes: TempLinkDuration;
}

export interface TempLinkHistoryEntry {
  token: string;
  siteName: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
  durationMinutes: TempLinkDuration;
  revoked: boolean;
}

// Mirrors useAnalyticsPage's plan-check shape - same reasoning applies
// here: this is a UX paywall (like every other Pro-gated page in this
// dashboard), not the security boundary. The actual server-side Pro check
// lives in generateTempClockLink itself.
export function useTempClockLinkPage() {
  const { userData } = useAuth();
  const { sites } = useSites();
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [activeLinks, setActiveLinks] = useState<ActiveTempLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [history, setHistory] = useState<TempLinkHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [siteId, setSiteId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<TempLinkDuration>(10);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      setPlanTier(snapshot.exists() ? snapshot.data().planTier ?? null : null);
      setPlanLoading(false);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  const isPro = isProPlan(planTier);

  // Deliberately does not set linksLoading(true) at the top - linksLoading
  // already starts true for the initial mount fetch, and a later refresh
  // (after generating/revoking a link) should swap the list in place
  // without a loading flicker. That also keeps every setState this
  // function makes strictly post-await, not synchronous within whatever
  // effect calls it.
  const refreshLinks = useCallback(async () => {
    try {
      const listFn = httpsCallable(functions, "listActiveTempClockLinks");
      const result = await listFn();
      const { links } = result.data as { links: ActiveTempLink[] };
      setActiveLinks(links);
    } catch (err) {
      console.error("Failed to load active temp clock-in links:", err);
    } finally {
      setLinksLoading(false);
    }
  }, []);

  // Same not-loading-synchronously reasoning as refreshLinks above.
  const refreshHistory = useCallback(async () => {
    try {
      const historyFn = httpsCallable(functions, "listTempClockLinkHistory");
      const result = await historyFn();
      const { links } = result.data as { links: TempLinkHistoryEntry[] };
      setHistory(links);
    } catch (err) {
      console.error("Failed to load temp clock-in link history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPro) return;
    refreshLinks();
    refreshHistory();
  }, [isPro, refreshLinks, refreshHistory]);

  // Derived during render rather than via an effect+setState round trip -
  // defaults to the first site until the admin picks one explicitly.
  const effectiveSiteId = siteId || sites[0]?.id || "";

  async function generateLink() {
    if (!effectiveSiteId) {
      setError("Choose a job site first.");
      return;
    }
    setError("");
    setGenerating(true);
    try {
      const generateFn = httpsCallable(functions, "generateTempClockLink");
      await generateFn({ siteId: effectiveSiteId, durationMinutes });
      await Promise.all([refreshLinks(), refreshHistory()]);
    } catch (err) {
      console.error("Failed to generate temp clock-in link:", err);
      setError((err as { message?: string })?.message ?? "Something went wrong. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function revokeLink(token: string) {
    try {
      const revokeFn = httpsCallable(functions, "revokeTempClockLink");
      await revokeFn({ token });
      setActiveLinks((prev) => prev.filter((l) => l.token !== token));
      setHistory((prev) => prev.map((h) => (h.token === token ? { ...h, revoked: true } : h)));
    } catch (err) {
      console.error("Failed to revoke temp clock-in link:", err);
    }
  }

  return {
    planLoading,
    isPro,
    sites,
    siteId: effectiveSiteId,
    setSiteId,
    durationMinutes,
    setDurationMinutes,
    generating,
    error,
    activeLinks,
    linksLoading,
    history,
    historyLoading,
    generateLink,
    revokeLink,
  };
}
