import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { withTimeout } from "./punchQueueLogic";
import { reportSendOutcome, reportsToSend, toReportPayload } from "./removedReportLogic";
import { deleteReport, listRemovedReports, markReportRefused, markReportSyncing, markReportWaiting } from "./removedReports";

// RC1 follow-up - sends this employee's "removed an unsent punch/comment"
// reports to reportRemovedItem (the admin's punchRemoved alert). Called by
// syncPunchQueue at the start of every run, so a removal made offline is
// reported as soon as there's signal. Never touches punches or comments.
//   answered        -> deleted (the server has it)
//   refused input   -> kept as failed (would be refused forever)
//   anything else   -> back to waiting, stop this run (sent next run)

const reportFn = httpsCallable(functions, "reportRemovedItem", { timeout: 20000 });
const CALL_TIMEOUT_MS = 20000;
const MAX_PER_RUN = 50;

export async function drainRemovedReports(companyId, employeeId) {
  if (!auth.currentUser) return;
  const list = reportsToSend(await listRemovedReports(), companyId, employeeId);
  for (const row of list.slice(0, MAX_PER_RUN)) {
    if (!(await isOnline())) return;
    await markReportSyncing(row.requestId);
    try {
      await withTimeout(reportFn(toReportPayload(row)), CALL_TIMEOUT_MS);
      await deleteReport(row.requestId);
    } catch (err) {
      if (reportSendOutcome(err) === "refused") {
        await markReportRefused(row.requestId);
        continue;
      }
      await markReportWaiting(row.requestId);
      return;
    }
  }
}
