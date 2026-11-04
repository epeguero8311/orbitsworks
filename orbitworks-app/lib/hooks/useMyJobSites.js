import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { readHomeCache, writeHomeCache } from "../employeeHomeCache";

// Employee App Phase 5 (decided 2026-11-03, Settings 16): the employee's
// assigned job sites for the Settings "Job site" row. Each one is read by
// id (firestore.rules lets an employee get only the sites assigned to them,
// never list). Same offline pattern as useEmployeeSelfView: the last copy
// saved on the phone shows right away, live data replaces it, and only a
// full set of server answers is saved (lib/employeeHomeCache.js, "jobSites").
// assignedSiteIds comes from the self view.
// -> { sites: { [siteId]: { name, active } }, loading }
const NO_SITES = { sites: {}, loading: false };

export function useMyJobSites(companyId, employeeId, assignedSiteIds) {
  const ids = Array.isArray(assignedSiteIds) ? assignedSiteIds.filter((id) => typeof id === "string" && id !== "") : [];
  const idsKey = ids.join(",");
  const [state, setState] = useState({ sites: {}, loading: true });

  useEffect(() => {
    if (!companyId || !employeeId || !idsKey) return undefined;
    const wanted = idsKey.split(",");
    let cancelled = false;
    let live = false;
    const fromServer = {};
    const answered = new Set();

    readHomeCache("jobSites", companyId, employeeId).then((saved) => {
      if (!cancelled && !live && saved && saved.sites) setState({ sites: saved.sites, loading: false });
    });
    const done = (id, site, server) => {
      if (cancelled) return;
      live = true;
      if (site) fromServer[id] = site;
      else delete fromServer[id];
      if (server) answered.add(id);
      setState({ sites: { ...fromServer }, loading: false });
      if (wanted.every((w) => answered.has(w))) writeHomeCache("jobSites", companyId, employeeId, { sites: { ...fromServer } });
    };

    const unsubscribes = wanted.map((id) =>
      onSnapshot(
        doc(db, "companies", companyId, "jobSites", id),
        (snap) => {
          // Offline with nothing in memory: keep the saved copy.
          if (snap.metadata.fromCache && !snap.exists()) return;
          const data = snap.exists() ? snap.data() : null;
          done(id, data ? { name: typeof data.name === "string" ? data.name : "", active: data.active !== false } : null, !snap.metadata.fromCache);
        },
        // Refused (no longer assigned) counts as an answer with no site.
        () => done(id, null, true)
      )
    );
    return () => {
      cancelled = true;
      unsubscribes.forEach((u) => u());
    };
  }, [companyId, employeeId, idsKey]);

  // No assigned sites (or the self view isn't in yet): nothing to read.
  return idsKey ? state : NO_SITES;
}
