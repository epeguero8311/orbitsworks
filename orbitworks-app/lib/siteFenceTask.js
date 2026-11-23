import { handleRegionEvent, SITE_FENCE_TASK } from "./siteTracking";

// Employee App Phase 8 - the OS geofence region task. expo-task-manager
// needs it defined at the top level, every time the JS loads - also when
// the OS wakes the app in the background for a region event with the app
// closed - so index.js loads this file before the app itself. Lazily
// required (same reason as lib/locationPermission.js): a build without the
// native modules must never fail to start.
//
// FLAG ONLY: a region event never touches a punch.
try {
  const TaskManager = require("expo-task-manager");
  const Location = require("expo-location");
  if (!TaskManager.isTaskDefined(SITE_FENCE_TASK)) {
    TaskManager.defineTask(SITE_FENCE_TASK, async ({ data, error }) => {
      if (error || !data || !data.region) return;
      const kind = data.eventType === Location.GeofencingEventType.Enter ? "enter" : "exit";
      await handleRegionEvent(data.region.identifier, kind);
    });
  }
} catch (e) {
  console.log("[siteFenceTask] not available:", e.message);
}
