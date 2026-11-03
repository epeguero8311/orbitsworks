import { auth } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { listAllPunches } from "./punchQueue";
import { withTimeout } from "./punchQueueLogic";
import { commentDoc, commentErrorKind, commentsToSend } from "./commentQueueLogic";
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
//   a resend                         -> already on the server? Synced
//   clock-in not on the server       -> Not synced
//   create accepted                  -> Synced
//   refused by the rules             -> already there? Synced : Not synced
//   signal / timeout                 -> back to Waiting, stop this run
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
  const { companyId, requestId } = comment;
  await markCommentSyncing(requestId);
  try {
    // A resend: an earlier try may have landed with its reply lost.
    if (comment.attempts > 0 && (await withTimeout(commentExistsOnServer(companyId, requestId), CALL_TIMEOUT_MS))) {
      await markCommentSynced(requestId);
      return true;
    }
    const clockIn = await withTimeout(readClockInFromServer(companyId, comment.clockEventId), CALL_TIMEOUT_MS);
    if (!clockIn) {
      await markCommentFailed(requestId, "clockInMissing");
      return true;
    }
    let fields;
    try {
      fields = commentDoc(comment, { uid, clockIn });
    } catch {
      // The saved note no longer passes the checks - it never will.
      await markCommentFailed(requestId, "invalid");
      return true;
    }
    await withTimeout(createShiftComment(companyId, requestId, fields), CALL_TIMEOUT_MS);
    await markCommentSynced(requestId);
    return true;
  } catch (err) {
    if (commentErrorKind(err) !== "refused") {
      await markCommentWaiting(requestId);
      return false;
    }
    // Refused: a create on an id that is already there counts as an
    // update, which the rules never allow - so check before Not synced.
    try {
      if (await withTimeout(commentExistsOnServer(companyId, requestId), CALL_TIMEOUT_MS)) {
        await markCommentSynced(requestId);
        return true;
      }
    } catch {
      await markCommentWaiting(requestId);
      return false;
    }
    await markCommentFailed(requestId, "refused");
    return true;
  }
}
