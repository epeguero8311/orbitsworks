import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Last known home-screen data, kept on the phone so an offline restart
// shows it instead of 0 active employees and the user's email. Firestore
// here is memory-only, so without this nothing survives a restart.
//
// Saved only from server data (never from an offline/empty result), one
// copy per signed-in user. Stores just what Home needs: each employee's
// status and sites (so the site filter and offline clock-ins still work
// on top of it) plus the user's name and photo.

const keyFor = (uid) => `homeSnapshot:${uid}`;

export function useHomeSnapshot({ uid, companyId, liveEmployees, liveReady, isOffline, displayName, photoUrl }) {
  const [snapshot, setSnapshot] = useState(null);
  const latestRef = useRef(null);

  // Load once per user.
  useEffect(() => {
    setSnapshot(null);
    if (!uid) return;
    let cancelled = false;
    AsyncStorage.getItem(keyFor(uid))
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.companyId === companyId) setSnapshot(parsed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid, companyId]);

  const save = () => {
    const next = latestRef.current;
    if (!next || !uid) return;
    const withTime = { ...next, savedAt: Date.now() };
    setSnapshot(withTime);
    AsyncStorage.setItem(keyFor(uid), JSON.stringify(withTime)).catch(() => {});
  };

  // Save whenever new server data arrives, and again at the moment the
  // phone goes offline, so "last updated" is when the data was last known
  // to be current rather than when it last happened to change.
  useEffect(() => {
    if (!liveReady || !uid) {
      latestRef.current = null;
      return;
    }
    latestRef.current = {
      companyId,
      displayName: displayName || null,
      photoUrl: photoUrl ?? null,
      employees: liveEmployees.map((e) => ({
        id: e.id,
        status: e.status,
        assignedSiteIds: e.assignedSiteIds ?? [],
        // Phase 10 (A3): the open shift's site, for the site filter offline.
        shiftSiteId: e.shiftSiteId ?? null,
      })),
    };
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveReady, liveEmployees, displayName, photoUrl, uid, companyId, isOffline]);

  // Same reason: an app closed while online should say when it was closed,
  // not when the list last changed.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") save();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return snapshot;
}
