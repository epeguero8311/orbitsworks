// iPad round 1 item 6 - lib/permissionErrors.ts. Run: node --test test/permissionErrors.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
const {
  permissionDeniedMessage,
  toastIfPermissionDenied,
  subscribePermissionToasts,
  isPermissionDenied,
  PERMISSION_ACTIONS,
} = await import("../lib/permissionErrors.ts");
const { PERMISSION_KEYS } = await import("../lib/adminAccess.ts");

const ASK = "Ask the owner or a Full access admin.";
const callable = (message, details) => ({ code: "functions/permission-denied", message, details });

test("callable with details.permission: named from the caller's action when it matches", () => {
  const err = callable('You don\'t have the "Create / edit employees" permission.', { reason: "permission", permission: "employees" });
  assert.equal(
    permissionDeniedMessage(err, { action: "add employees", permission: "employees" }),
    `You don't have permission to add employees. ${ASK}`
  );
  // a different permission than the caller expected -> the server's key wins
  assert.equal(
    permissionDeniedMessage(callable("x", { reason: "permission", permission: "editPay" }), { action: "add employees", permission: "employees" }),
    `You don't have permission to edit pay rates and wages. ${ASK}`
  );
});

test("every Task 4 permission has an action text", () => {
  for (const k of PERMISSION_KEYS) {
    assert.ok(PERMISSION_ACTIONS[k], k);
    assert.match(
      permissionDeniedMessage(callable("x", { reason: "permission", permission: k })),
      /^You don't have permission to .+\. Ask the owner or a Full access admin\.$/
    );
  }
});

test("not your site, specific server messages, generic 'Not authorized.'", () => {
  assert.equal(
    permissionDeniedMessage(callable("This shift is on a job site you don't have access to.", { reason: "notYourSite" })),
    `This shift is on a job site you don't have access to. ${ASK}`
  );
  assert.equal(permissionDeniedMessage(callable("Nobody can change the owner.")), "Nobody can change the owner.");
  assert.equal(
    permissionDeniedMessage(callable("Not authorized."), { action: "invite admins", permission: "invites" }),
    `You don't have permission to invite admins. ${ASK}`
  );
});

test("Firestore rules + Storage refusals: named from the caller", () => {
  const rules = { code: "permission-denied", message: "Missing or insufficient permissions." };
  assert.equal(permissionDeniedMessage(rules, { action: "edit job sites", permission: "settings" }), `You don't have permission to edit job sites. ${ASK}`);
  assert.equal(permissionDeniedMessage(rules, { permission: "editPay" }), `You don't have permission to edit pay rates and wages. ${ASK}`);
  assert.equal(permissionDeniedMessage({ code: "storage/unauthorized" }, {}), `You don't have permission to do this. ${ASK}`);
});

test("other errors are not permission errors (caller keeps its retry text)", () => {
  for (const e of [null, undefined, new Error("x"), { code: "functions/unavailable" }, { code: "unavailable" }, { code: "functions/internal", message: "boom" }]) {
    assert.equal(isPermissionDenied(e), false);
    assert.equal(permissionDeniedMessage(e, { permission: "employees" }), null);
  }
});

test("toastIfPermissionDenied: shows the toast only for permission refusals", () => {
  const seen = [];
  const off = subscribePermissionToasts((m) => seen.push(m));
  assert.equal(toastIfPermissionDenied({ code: "functions/unavailable" }, { permission: "employees" }), false);
  assert.equal(toastIfPermissionDenied({ code: "permission-denied" }, { action: "add employees" }), true);
  off();
  assert.equal(toastIfPermissionDenied({ code: "permission-denied" }, {}), true); // no listener: still true, no crash
  assert.deepEqual(seen, [`You don't have permission to add employees. ${ASK}`]);
});
