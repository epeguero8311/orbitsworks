import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { localPinGuess } from "./employeeQueue";

// Task 5 v2 (E a): the PIN the "Your PIN" modal shows BEFORE the account
// exists. Online: the server holds a fresh unique PIN for this login for
// 10 minutes (reserveEmployeePin) and also checks name + birthday for a
// duplicate first. Offline: a local guess, exactly like the old offline
// create (the server may still swap it on sync and say so).
// Throws { code: "duplicate" | "adminPin" | "createOff" | "notPro", message }
// for answers that mean "don't create".

const reserveFn = httpsCallable(functions, "reserveEmployeePin", { timeout: 10000 });

const STOP_REASONS = new Set(["duplicate", "adminPin", "createOff", "notPro"]);

export async function pinForNewEmployee({ name, dob, adminProof, mode }) {
  if (await isOnline()) {
    try {
      const res = await reserveFn({ name, dob, ...(adminProof ? { adminProof } : {}) });
      if (res?.data?.pin) return { pin: res.data.pin, held: true };
    } catch (err) {
      const reason = err && err.details && err.details.reason;
      if (STOP_REASONS.has(reason)) {
        const e = new Error(err.message || "Can't create this account.");
        e.code = reason;
        throw e;
      }
      if (err?.code === "functions/permission-denied" || err?.code === "functions/failed-precondition") {
        const e = new Error(err.message || "Not allowed.");
        e.code = "refused";
        throw e;
      }
      // Signal / server trouble: fall through to the offline guess.
    }
  }
  return { pin: await localPinGuess(mode), held: false };
}

// MM/DD/YYYY boxes -> YYYY-MM-DD, or an error. Any real past date.
export function birthdayIso({ mm, dd, yyyy }) {
  const ms = String(mm ?? "").trim();
  const ds = String(dd ?? "").trim();
  const ys = String(yyyy ?? "").trim();
  if (!/^\d{1,2}$/.test(ms) || !/^\d{1,2}$/.test(ds) || !/^\d{4}$/.test(ys)) {
    return { ok: false, error: "Enter the full birthday (MM/DD/YYYY)." };
  }
  const m = Number(ms);
  const d = Number(ds);
  const y = Number(ys);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!real || y < 1900 || date.getTime() > Date.now()) return { ok: false, error: "Enter a real birthday." };
  const pad = (n) => String(n).padStart(2, "0");
  return { ok: true, iso: `${y}-${pad(m)}-${pad(d)}` };
}

// YYYY-MM-DD -> the boxes' value.
export function birthdayBoxes(iso) {
  const m = typeof iso === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? { mm: m[2], dd: m[3], yyyy: m[1] } : { mm: "", dd: "", yyyy: "" };
}
