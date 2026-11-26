// Cleanup 2026-11-26 - website /delete-account (lib/deleteAccount.ts).
// Plain Node. Run via: node --test test/deleteAccount.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deleteAccountLoginKind,
  deleteAccountErrorMessage,
  DELETE_ACCOUNT_OPEN_SHIFT,
  DELETE_ACCOUNT_FAILED,
  DELETE_ACCOUNT_OFFLINE,
} from "../lib/deleteAccount.ts";

test("login kind matches the server's isEmployeeAppToken", () => {
  assert.equal(deleteAccountLoginKind({ role: "employee" }), "employeeApp");
  assert.equal(deleteAccountLoginKind({ role: "admin", appMode: "employee" }), "staff"); // final audit B
  assert.equal(deleteAccountLoginKind({ role: "admin" }), "staff");
  assert.equal(deleteAccountLoginKind({ role: "admin", appMode: "kiosk" }), "staff");
  assert.equal(deleteAccountLoginKind({ role: "supervisor" }), "staff");
  assert.equal(deleteAccountLoginKind({ role: "owner" }), "staff");
  assert.equal(deleteAccountLoginKind({ role: "kiosk" }), "kiosk");
  assert.equal(deleteAccountLoginKind({}), "staff");
});

test("server errors -> page text", () => {
  assert.equal(deleteAccountErrorMessage({ code: "functions/failed-precondition" }), DELETE_ACCOUNT_OPEN_SHIFT);
  assert.equal(deleteAccountErrorMessage({ code: "functions/unavailable" }), DELETE_ACCOUNT_OFFLINE);
  assert.equal(deleteAccountErrorMessage({ code: "deadline-exceeded" }), DELETE_ACCOUNT_OFFLINE);
  assert.equal(deleteAccountErrorMessage({ code: "functions/permission-denied" }), DELETE_ACCOUNT_FAILED);
  assert.equal(deleteAccountErrorMessage(null), DELETE_ACCOUNT_FAILED);
});

test("the page deletes only through the server callable, never from the client", () => {
  const src = readFileSync(new URL("../app/delete-account/page.tsx", import.meta.url), "utf8");
  assert.match(src, /httpsCallable\(functions, "deleteMyEmployeeAccount"/);
  assert.doesNotMatch(src, /deleteUser|deleteDoc|clockEvents/);
});
