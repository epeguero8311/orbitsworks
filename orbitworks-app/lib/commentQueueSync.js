import { auth } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { listAllPunches } from "./punchQueue";
import { withTimeout } from "./punchQueueLogic";
import { commentsToSend, runCommentSend } from "./commentQueueLogic";
import {
  cleanupCommentQueue,
  listAllComments,
  markCommentFailed,
  markCommentSynced,
  markCommentSyncing,
  markCommentWaiting,
} from "./commentQueue";
import { commentExistsOnServer, createShiftComment, readClockInFromServer } from "./shiftCommentApi";

// Employee App Phase 5 - sends the signed-in employee's saved shift
// comments. Called by syncPunchQueue (lib/punchQueueSync.js) right after
// the punches, in the same run - even when the punch queue is paused.
//
// Per comment, oldest first:
//   clock-in still on the phone      -> left Waiting (next run)
//   clock-in failed for good         -> Not synced
//   then the send steps in runCommentSend (lib/commentQueueLogic.js):
//   synced / Not synced / back to Waiting (signal - stop this run)
// A Not synced comment never stops the others or the punches.

const CALL_TIMEOUT_MS = 20000;
// Safety stop for one run.
const MAX_PER_RUN = 50;

export async function drainComments(companyId, employeeId) {
  await cleanupCommentQueue().catch(() => {});
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) return;
  const list = commentsToSend(await listAllComments(), await listAllPunches(), companyId, employeeId);
  for (const { comment, gate } of list.slice(0, MAX_PER_RUN)) {
    if (gate === "fail") {
      await markCommentFailed(comment.requestId, "clockInFailed");
      continue;
    }
    if (!(await isOnline())) return;
    const keepGoing = await sendOne(comment, uid);
    if (!keepGoing) return;
  }
}

// false = stop this run (signal problem; the comment is Waiting again).
async function sendOne(comment, uid) {
  const { companyId, requestId, clockEventId } = comment;
  await markCommentSyncing(requestId);
  const io = {
    uid,
    exists: () => withTimeout(commentExistsOnServer(companyId, requestId), CALL_TIMEOUT_MS),
    readClockIn: () => withTimeout(readClockInFromServer(companyId, clockEventId), CALL_TIMEOUT_MS),
    // Always the comment's own doc id, so no try can make a second comment.
    create: (fields) => withTimeout(createShiftComment(companyId, requestId, fields), CALL_TIMEOUT_MS),
  };
  const out = await runCommentSend(comment, io);
  if (out.result === "synced") {
    await markCommentSynced(requestId);
    return true;
  }
  if (out.result === "failed") {
    await markCommentFailed(requestId, out.reason);
    return true;
  }
  await markCommentWaiting(requestId);
  return false;
}
