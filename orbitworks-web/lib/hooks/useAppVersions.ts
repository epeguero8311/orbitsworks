"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { readAppVersionsConfig, type AppVersionsConfig } from "@/lib/appVersions";

// Task 6: appConfig/versions, live (signed-in read). null until it exists.
export function useAppVersions(): AppVersionsConfig {
  const [config, setConfig] = useState<AppVersionsConfig>(null);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "appConfig", "versions"),
        (snap) => setConfig(snap.exists() ? readAppVersionsConfig(snap.data()) : null),
        () => setConfig(null)
      ),
    []
  );
  return config;
}
