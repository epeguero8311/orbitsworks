import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { syncPunchQueue } from "./punchQueueSync";
import { listAllPunches } from "./punchQueue";
import { listAllComments } from "./commentQueue";
import { listSiteExits } from "./siteExitStore";
import {
  deleteAccountErrorMessage,
  deleteAccountWaitingCounts,
  deleteAccountWaitingMessage,
} from "./employeeSettings";

// Employee App "Delete account" (biometric audit b). The server
// (functions/src/employeeAccount.ts deleteMyEmployeeAccount) deletes the
// login, the photo and selfie and the PIN, and keeps the row and clock
// history as the employer's records. Before calling it the phone sends
// everything still waiting (punches, comments, job site records) and stops
// if anything is left - it would be lost with the login.
// Returns { ok: true } or { error: "what to show" }.

const deleteFn = httpsCallable(functions, "deleteMyEmployeeAccount", { timeout: 60000 });

export async function deleteMyEmployeeAccount(companyId, employeeId) {
  if (!(await isOnline())) return { error: deleteAccountErrorMessage({ code: "unavailable" }) };
  await syncPunchQueue(companyId, employeeId).catch(() => {});
  const [punches, comments, siteExits] = await Promise.all([listAllPunches(), listAllComments(), listSiteExits()]);
  const w = deleteAccountWaitingCounts(punches, comments, siteExits, companyId, employeeId);
  const waiting = deleteAccountWaitingMessage(w.punches, w.comments, w.siteExits);
  if (waiting) return { error: waiting };
  try {
    await deleteFn({ confirm: true });
    return { ok: true };
  } catch (err) {
    return { error: deleteAccountErrorMessage(err) };
  }
}
