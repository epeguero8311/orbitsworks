"use client";

import { Suspense } from "react";
import { useSites } from "@/lib/hooks/useSites";
import CrewAccessTabs from "@/components/crewAccess/CrewAccessTabs";
import CrewAccessLocked from "@/components/crewAccess/CrewAccessLocked";

// Crew Access: Temporary clock-in link + Crew onboarding (crew codes).
// Core sees one locked card and no tabs.
export default function CrewAccessPage() {
  const { isPro, planLoaded } = useSites();
  const loading = <p className="mt-6 text-sm text-gray-600">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Crew Access</h1>
      <p className="mt-1 text-sm text-gray-600">
        Two ways to bring crew in: a short-lived link to clock in without the app, or a crew code to sign
        up in the app.
      </p>
      {!planLoaded ? (
        loading
      ) : !isPro ? (
        <CrewAccessLocked />
      ) : (
        <Suspense fallback={loading}>
          <CrewAccessTabs />
        </Suspense>
      )}
    </div>
  );
}
