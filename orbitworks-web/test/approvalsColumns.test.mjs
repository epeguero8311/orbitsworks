// Task 2 - Approve Hours customizable columns: the column list + Type /
// Device labels. Plain Node, no emulator.
// Run via: node --test test/approvalsColumns.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVALS_COLUMNS,
  OPTIONAL_APPROVALS_COLUMNS,
  DEFAULT_APPROVALS_COLUMNS,
  MAX_OPTIONAL_APPROVALS_COLUMNS,
  readSavedApprovalsColumns,
  visibleApprovalsColumns,
  approvalsColumnHiddenReason,
  approvalsColumnsToSave,
  approvalsColumnsUsed,
  buildColumnWidths,
  approvalsColumnCount,
} from "../lib/approvalsColumns.ts";
import { clockTypeLabel, clockDeviceLabel } from "../lib/approvalsClockInfo.ts";
const { approvalsColumnsSchema } = await import("../lib/validators/approvalsColumns.ts");

const CORE_OFF = { isPro: false, overtimeEnabled: false };
const PRO_ON = { isPro: true, overtimeEnabled: true };

test("D1: never saved = today's 8 columns, in today's order", () => {
  assert.deepEqual(visibleApprovalsColumns(null, CORE_OFF), [
    "name",
    "company",
    "site",
    "job",
    "time",
    "break",
    "worked",
    "status",
  ]);
  assert.deepEqual(visibleApprovalsColumns(null, PRO_ON), visibleApprovalsColumns(null, CORE_OFF));
  assert.equal(DEFAULT_APPROVALS_COLUMNS.length, MAX_OPTIONAL_APPROVALS_COLUMNS);
});

test("D1: default widths are exactly the Phase 10 widths (nothing changes visually)", () => {
  const cols = visibleApprovalsColumns(null, CORE_OFF);
  assert.deepEqual(buildColumnWidths("day", cols), [
    "40px",
    "calc(18% - 7.2px)",
    "calc(11% - 4.4px)",
    "calc(10% - 4px)",
    "calc(12% - 4.8px)",
    "calc(18% - 7.2px)",
    "calc(7% - 2.8px)",
    "calc(7% - 2.8px)",
    "calc(17% - 6.8px)",
  ]);
  assert.deepEqual(buildColumnWidths("week", cols), [
    "40px",
    "calc(8% - 3.2px)",
    "calc(15% - 6px)",
    "calc(10% - 4px)",
    "calc(10% - 4px)",
    "calc(12% - 4.8px)",
    "calc(14% - 5.6px)",
    "calc(7% - 2.8px)",
    "calc(7% - 2.8px)",
    "calc(17% - 6.8px)",
  ]);
});

test("custom set: Name | Worked | Status, widths still fill 100%", () => {
  const cols = visibleApprovalsColumns(["worked"], CORE_OFF);
  assert.deepEqual(cols, ["name", "worked", "status"]);
  const widths = buildColumnWidths("day", cols);
  assert.equal(widths.length, approvalsColumnCount("day", cols));
  const pct = widths.slice(1).reduce((a, w) => a + Number(/calc\(([\d.]+)%/.exec(w)[1]), 0);
  assert.ok(Math.abs(pct - 100) < 0.05, `sum ${pct}`);
});

test("show/hide only: display order never follows the saved order", () => {
  assert.deepEqual(visibleApprovalsColumns(["worked", "company"], CORE_OFF), ["name", "company", "worked", "status"]);
});

test("D2: Regular/Overtime hidden while Overtime is OFF, drawn (before Worked) when ON", () => {
  const saved = ["time", "regularHours", "overtimeHours", "worked"];
  assert.deepEqual(visibleApprovalsColumns(saved, { isPro: false, overtimeEnabled: false }), [
    "name",
    "time",
    "worked",
    "status",
  ]);
  assert.deepEqual(visibleApprovalsColumns(saved, { isPro: false, overtimeEnabled: true }), [
    "name",
    "time",
    "regularHours",
    "overtimeHours",
    "worked",
    "status",
  ]);
  assert.equal(approvalsColumnHiddenReason("overtimeHours", CORE_OFF), "overtime");
});

test("D5/D6: Type + Device hidden off Pro (Core and Free alike), dropped on the next save", () => {
  const saved = ["clockInType", "clockOutDevice", "worked"];
  assert.deepEqual(visibleApprovalsColumns(saved, CORE_OFF), ["name", "worked", "status"]);
  assert.deepEqual(visibleApprovalsColumns(saved, PRO_ON), [
    "name",
    "worked",
    "clockInType",
    "clockOutDevice",
    "status",
  ]);
  assert.equal(approvalsColumnHiddenReason("clockInType", CORE_OFF), "pro");
  assert.deepEqual(approvalsColumnsToSave(saved, { isPro: false }), ["worked"]);
  assert.deepEqual(approvalsColumnsToSave(saved, { isPro: true }), ["worked", "clockInType", "clockOutDevice"]);
});

test("max 8: counter counts Name + Status + saved columns (hidden OT ones too, Pro ones off Pro not)", () => {
  assert.equal(approvalsColumnsUsed(DEFAULT_APPROVALS_COLUMNS, { isPro: true }), 8);
  assert.equal(approvalsColumnsUsed(["regularHours", "overtimeHours"], { isPro: false }), 4);
  assert.equal(approvalsColumnsUsed(["clockInType", "worked"], { isPro: false }), 3);
  assert.equal(approvalsColumnsUsed(["clockInType", "worked"], { isPro: true }), 4);
});

test("reading the saved field: missing = default, junk dropped, capped at 6", () => {
  assert.equal(readSavedApprovalsColumns(undefined), null);
  assert.equal(readSavedApprovalsColumns("worked"), null);
  assert.deepEqual(readSavedApprovalsColumns([]), []);
  assert.deepEqual(readSavedApprovalsColumns(["worked", "worked", "name", "nope", 3]), ["worked"]);
  assert.deepEqual(readSavedApprovalsColumns([...OPTIONAL_APPROVALS_COLUMNS]).length, 6);
  // An empty saved list = only Name + Status (not the default).
  assert.deepEqual(visibleApprovalsColumns([], CORE_OFF), ["name", "status"]);
});

test("every column has a weight and the optional list matches the column list", () => {
  const keys = APPROVALS_COLUMNS.map((c) => c.key);
  assert.deepEqual(
    keys.filter((k) => k !== "name" && k !== "status"),
    [...OPTIONAL_APPROVALS_COLUMNS]
  );
  for (const c of APPROVALS_COLUMNS) assert.ok(c.dayWeight > 0 && c.weekWeight > 0, c.key);
});

test("validator: optional keys only, no duplicates, max 6", () => {
  assert.equal(approvalsColumnsSchema.safeParse([...DEFAULT_APPROVALS_COLUMNS]).success, true);
  assert.equal(approvalsColumnsSchema.safeParse([]).success, true);
  assert.equal(approvalsColumnsSchema.safeParse(["name"]).success, false);
  assert.equal(approvalsColumnsSchema.safeParse(["status"]).success, false);
  assert.equal(approvalsColumnsSchema.safeParse(["tips"]).success, false);
  assert.equal(approvalsColumnsSchema.safeParse(["worked", "worked"]).success, false);
  assert.equal(approvalsColumnsSchema.safeParse([...DEFAULT_APPROVALS_COLUMNS, "regularHours"]).success, false);
  assert.equal(approvalsColumnsSchema.safeParse("worked").success, false);
});

test("D3/D10: Type maps every source", () => {
  const cases = {
    adminManual: "Admin Manual",
    employeeApp: "Employee App",
    pin: "Supervisor App",
    supervisorPin: "Supervisor App",
    supervisorOverride: "Supervisor App",
    faceMatch: "Supervisor App",
    tempLink: "Quick Link",
    autoClockOut: "Auto clock-out",
    employeeDeactivated: "Deactivated",
    autoBreakEnd: "-",
  };
  for (const [source, label] of Object.entries(cases)) assert.equal(clockTypeLabel({ source }), label, source);
  assert.equal(clockTypeLabel(undefined), "-");
  assert.equal(clockTypeLabel({}), "-");
});

test("D4: Device - supervisor app name / Unnamed device, employee phone, else -", () => {
  assert.equal(clockDeviceLabel({ source: "pin", deviceId: "d1", deviceNameSnapshot: "Gate iPad" }), "Gate iPad");
  assert.equal(clockDeviceLabel({ source: "supervisorOverride", deviceId: "d1", deviceNameSnapshot: null }), "Unnamed device");
  assert.equal(clockDeviceLabel({ source: "pin" }), "-");
  assert.equal(clockDeviceLabel({ source: "employeeApp" }), "Employee's phone");
  assert.equal(clockDeviceLabel({ source: "tempLink" }), "-");
  assert.equal(clockDeviceLabel({ source: "adminManual", deviceId: "d1" }), "-");
  assert.equal(clockDeviceLabel({ source: "autoClockOut" }), "-");
  assert.equal(clockDeviceLabel(null), "-");
});
