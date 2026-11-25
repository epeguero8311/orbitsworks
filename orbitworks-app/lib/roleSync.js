// RC1 - role changed on the website while this phone is signed in.
//
// Pure decisions only (no React Native imports) so test/roleSync.test.js
// runs under `node --test`. AuthContext.js does the I/O.
//
// The rule: the app ALWAYS routes by the role in its ID token, because
// that is the role firestore.rules and every callable check. users/{uid}
// only adds the name etc. When users/{uid} says the role changed (a
// different role, or roleChangedAt newer than the token), the app:
//   1. sends what the OLD role saved on this phone, with the old token
//      (a demoted supervisor's punches for others can only be sent by a
//      supervisor token; a promoted employee's own punches go either way -
//      the server takes them from the new token too, RC1 C)
//   2. forces a token refresh, retrying while the server catches up
//   3. switches screens only once the new token has the new role.
// Offline it changes nothing: the token can't be refreshed, and the
// current screens keep matching the current token.

const STAFF_ROLES = ["owner", "admin", "supervisor"];

function roleFamily(role) {
  if (role === "employee") return "employee";
  // Task 5: a shared Kiosk iPad - its own screens and its own queue.
  if (role === "kiosk") return "kiosk";
  if (STAFF_ROLES.includes(role)) return "staff";
  return null;
}

function toMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  if (typeof v._seconds === "number") return v._seconds * 1000 + Math.floor((v._nanoseconds || 0) / 1e6);
  if (typeof v === "number") return v;
  return null;
}

// role/companyId/employeeId (+ when it was issued) from ID token claims.
// null when the token has no usable role (a brand-new sign-up whose
// claims aren't set yet).
function claimsFields(claims) {
  if (!claims || typeof claims.role !== "string" || typeof claims.companyId !== "string") return null;
  return {
    role: claims.role,
    companyId: claims.companyId,
    employeeId: typeof claims.employeeId === "string" ? claims.employeeId : null,
    issuedAtMs: typeof claims.iat === "number" ? claims.iat * 1000 : null,
  };
}

// What the screens see. The token's role/companyId/employeeId always win;
// the users doc adds everything else (name, assignedSiteIds, ...).
function mergeUserData(usersDoc, claims) {
  if (!claims) return usersDoc || null;
  const base = usersDoc || { fromCachedClaims: true };
  return {
    ...base,
    role: claims.role,
    companyId: claims.companyId,
    employeeId: claims.employeeId ?? (usersDoc && usersDoc.employeeId) ?? null,
  };
}

// Does the users doc say this token is out of date?
// handledChangeMs = the roleChangedAt this phone already refreshed for, so
// a token issued in the same second as the change (iat has 1 s precision)
// never loops.
function needsRoleRefresh({ claims, usersDoc, handledChangeMs = null }) {
  if (!claims || !usersDoc || typeof usersDoc.role !== "string") return false;
  const changedMs = toMillis(usersDoc.roleChangedAt);
  if (changedMs !== null && handledChangeMs !== null && changedMs <= handledChangeMs) {
    // Already refreshed for this change: only a role that still differs
    // (the server hadn't set the claims yet) is worth another try.
    return usersDoc.role !== claims.role;
  }
  if (usersDoc.role !== claims.role) return true;
  if (changedMs === null || claims.issuedAtMs === null) return false;
  return changedMs > claims.issuedAtMs;
}

// What has to happen before the screens may switch.
//   sameScreens - admin <-> supervisor (<-> owner): same screens, both can
//                 send the supervisor queue; refresh only
//   promotion   - employee -> staff: send the employee's own saved punches
//                 first (the server also takes them later, RC1 C)
//   demotion    - staff -> employee: send the supervisor queue (punches
//                 for others, new employees, edits) first - an employee
//                 token can never send those
//   kioskExit   - kiosk -> anything (Task 5): send the tablet's saved kiosk
//                 punches first - only a kiosk token can send them
function transitionPlan(fromRole, toRole) {
  const from = roleFamily(fromRole);
  const to = roleFamily(toRole);
  if (!from || !to || from === to) return { kind: "sameScreens", drain: null, drainMaxMs: 0 };
  if (from === "kiosk") return { kind: "kioskExit", drain: "kioskPunches", drainMaxMs: 60000 };
  if (from === "employee") return { kind: "promotion", drain: "employeePunches", drainMaxMs: 20000 };
  return { kind: "demotion", drain: "staffQueues", drainMaxMs: 60000 };
}

// Waits between forced refreshes while the new claims aren't there yet
// (setEmployeeRole sets them first, so normally the first one works).
const REFRESH_RETRY_MS = [0, 2000, 5000, 15000];

// Text for what is still on the phone after the switch (null = nothing).
function leftoverNotice(kind, leftover) {
  if (!leftover || leftover <= 0) return null;
  const n = leftover === 1 ? "1 item" : `${leftover} items`;
  if (kind === "promotion") {
    return `${n} you saved as an employee ${leftover === 1 ? "is" : "are"} still sending. ${leftover === 1 ? "It keeps" : "They keep"} sending in the background - check Sync Queue.`;
  }
  if (kind === "kioskExit") {
    return `${n} saved in Kiosk mode couldn't be sent. ${leftover === 1 ? "It stays" : "They stay"} on this iPad and ${leftover === 1 ? "sends" : "send"} the next time the kiosk login signs in here. Tell your admin.`;
  }
  if (kind === "demotion") {
    return `${n} saved in the supervisor app couldn't be sent yet. ${leftover === 1 ? "It stays" : "They stay"} on this phone and ${leftover === 1 ? "sends" : "send"} the next time a supervisor or admin signs in here. Tell your admin.`;
  }
  return null;
}

// The signed-in person's own Employee App punches still on this phone
// (not yet on the server), oldest first. After a promotion these keep
// sending from the supervisor app (RC1 C) and show in its Sync Queue.
function openOwnPunches(items, companyId, employeeId) {
  return (items || [])
    .filter((i) => i.companyId === companyId && i.employeeId === employeeId && i.status !== "synced")
    .sort((a, b) => (a.queuedAtMs || 0) - (b.queuedAtMs || 0));
}

module.exports = {
  REFRESH_RETRY_MS,
  openOwnPunches,
  claimsFields,
  leftoverNotice,
  mergeUserData,
  needsRoleRefresh,
  roleFamily,
  toMillis,
  transitionPlan,
};
