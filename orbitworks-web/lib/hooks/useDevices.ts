"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { deviceConverter } from "@/lib/firebase/converters";
import type { Device } from "@/lib/types";

export interface UnnamedDevice {
  deviceId: string;
  lastSeen: Timestamp | null;
}

// How far back to look for deviceIds with no matching devices doc yet.
// clockEvents has no field that marks "has a deviceId", so this scans the
// most recent events for the company and filters client-side - bounded by
// this limit rather than a date range, same tradeoff useEmployees/useSites
// make by not paginating.
const RECENT_EVENTS_SCAN_LIMIT = 300;

export function useDevices() {
  const { userData } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState(false);
  const [seenDeviceIds, setSeenDeviceIds] = useState<Map<string, Timestamp | null>>(new Map());

  useEffect(() => {
    if (!userData?.companyId) return;

    const devicesRef = collection(db, "companies", userData.companyId, "devices").withConverter(
      deviceConverter
    );

    const unsubscribe = onSnapshot(
      devicesRef,
      (snapshot) => {
        setDevices(snapshot.docs.map((d) => d.data()));
        setDevicesLoading(false);
      },
      (err) => {
        console.error("Devices listener error:", err);
        setDevicesError(true);
        setDevicesLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  useEffect(() => {
    if (!userData?.companyId) return;

    const eventsRef = collection(db, "companies", userData.companyId, "clockEvents");
    const q = query(eventsRef, orderBy("timestamp", "desc"), limit(RECENT_EVENTS_SCAN_LIMIT));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const seen = new Map<string, Timestamp | null>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const deviceId = data.deviceId;
          if (typeof deviceId === "string" && deviceId && !seen.has(deviceId)) {
            seen.set(deviceId, (data.timestamp as Timestamp | undefined) ?? null);
          }
        });
        setSeenDeviceIds(seen);
      },
      (err) => {
        // Unnamed-device discovery is a nice-to-have on top of the named
        // devices list, not the reason this card exists - a failure here
        // should never block or blank out the rest of the card.
        console.error("Recent clockEvents scan for unnamed devices failed:", err);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  const unnamedDevices: UnnamedDevice[] = useMemo(() => {
    const namedIds = new Set(devices.map((d) => d.id));
    return Array.from(seenDeviceIds.entries())
      .filter(([deviceId]) => !namedIds.has(deviceId))
      .map(([deviceId, lastSeen]) => ({ deviceId, lastSeen }));
  }, [devices, seenDeviceIds]);

  return {
    devices,
    unnamedDevices,
    loading: devicesLoading,
    error: devicesError,
  };
}
