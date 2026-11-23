import { doc, getDocFromServer, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { commentErrorKind } from "./commentQueueLogic";

// Employee App Phase 5 - the Firestore calls behind the comment queue
// (lib/commentQueueSync.js). Every read goes to the server, never the
// phone's cache: "is it there?" must be the server's answer.

function noteRef(companyId, requestId) {
  return doc(db, "companies", companyId, "shiftNotes", requestId);
}

// The shift's clock-in as the server has it, or null if it isn't there.
// The rules answer a missing clock event with permission-denied (its
// employeeId can't be checked), so that also means "not there". Signal
// problems throw.
export async function readClockInFromServer(companyId, clockEventId) {
  try {
    const snap = await getDocFromServer(doc(db, "companies", companyId, "clockEvents", clockEventId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    if (commentErrorKind(err) === "refused") return null;
    throw err;
  }
}

// true when the comment is already on the server (an earlier try landed).
// The rules answer "not found" for a missing id (firestore.rules,
// shiftNotes). permission-denied is also read as "not there", for rules
// from before Phase 5. Signal problems throw.
export async function commentExistsOnServer(companyId, requestId) {
  try {
    const snap = await getDocFromServer(noteRef(companyId, requestId));
    return snap.exists();
  } catch (err) {
    if (commentErrorKind(err) === "refused") return false;
    throw err;
  }
}

// Creates the comment with doc id = its requestId. fields from
// commentDoc() (commentQueueLogic.js); the server time is added here.
export async function createShiftComment(companyId, requestId, fields) {
  await setDoc(noteRef(companyId, requestId), { ...fields, timestamp: serverTimestamp() });
}
