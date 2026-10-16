import { findEmployeeByPinLocal } from "./pinSync";
import { checkPinLockout, recordPinAttempt, resetPinLockout } from "./pinLockout";

// PIN matching now happens locally against a hashed cache synced down by
// pinSync.js - this works offline and online, and has the same trust
// boundary as the old verifyPin Cloud Function (a plaintext-equivalent
// match, no re-check at write time either before or after this change).
// Rate limiting is mirrored locally via pinLockout.js since there is no
// server round trip to rate-limit against anymore.
export async function findEmployeeByPin(companyId, pin) {
  const lockout = checkPinLockout();
  if (lockout.locked) {
    throw new Error(`Too many attempts. Please wait ${lockout.retryAfterSeconds} seconds.`);
  }

  recordPinAttempt();
  const employee = await findEmployeeByPinLocal(pin);

  if (employee) {
    resetPinLockout();
  }

  return employee;
}
