import { auth } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { listAllPunches } from "./punchQueue";
import { withTimeout } from "./punchQueueLogic";
import { siteExitsToSend } from "./siteExitLogic";
import {
  cleanupSiteExitQueue,
  listSiteExits,
  markSiteExitFailed,
  markSiteExitSynced,
  markSiteExitSyncing,
  markSiteExitWaiting,
} from "./siteExitStore";
import { sendSiteExit } from "./siteExitApi";
import { stopShiftTracking } from "./siteTracking";

// Employee App Phase 8 - sends the signed-in employee's queued "left" /
// "tracking off" starts and ends (recordSiteExit). Called by syncPunchQueue
// right after comments, in the same run - even when the punch queue is
// paused. Never touches punches or comments.
//
// Per row, oldest first (siteExitLogic.siteExitsToSend):
//   a start still inside its 2 min, an end whose start is still here, or a
//   row whose clock-in is still on the phone -> left Waiting (next run)
//   clock-in failed for good -> dropped (failed)
//   sent:
//     answered            -> Synced (recorded or not - the server decides)
//     tracking: false     -> also stop tracking this shift on the phone
//     refused (bad input) -> dropped (failed), the rest go on
//     signal / timeout    -> back to Waiting, stop this run

const CALL_TIMEOUT_MS = 20000;
const MAX_PER_RUN = 50;
const REFUSED = ["functions/invalid-argument", "functions/permission-denied", "functions/failed-precondition", "invalid-argument", "permission-denied", "failed-precondition"];

export async function drainSiteExits(companyId, employeeId) {
  await cleanupSiteExitQueue().catch(() => {});
  if (!auth.currentUser) return;
  const list = siteExitsToSend(await listSiteExits(), await listAllPunches(), companyId, employeeId, Date.now());
  for (const { row, gate } of list.slice(0, MAX_PER_RUN)) {
    if (gate === "fail") {
      await markSiteExitFailed(row.requestId, "clockInFailed");
      continue;
    }
    if (!(await isOnline())) return;
    await markSiteExitSyncing(row.requestId);
    try {
      const res = await withTimeout(sendSiteExit(row), CALL_TIMEOUT_MS);
      await markSiteExitSynced(row.requestId);
      if (res && res.tracking === false) await stopShiftTracking(row.clockInEventId);
    } catch (err) {
      const code = err && typeof err.code === "string" ? err.code : "";
      if (REFUSED.includes(code)) {
        await markSiteExitFailed(row.requestId, "refused");
        continue;
      }
      await markSiteExitWaiting(row.requestId);
      return;
    }
  }
}
