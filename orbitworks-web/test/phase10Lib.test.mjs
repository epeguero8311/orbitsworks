// Phase 10 fix round 1 - the website's pure helpers: list paging + employee
// search (W3-W5), Overview alerts window (W8), approvals start date for
// Reports / Analytics (W8), Timesheet Approvals widths without Shift (W6).
// Plain Node, no emulator.
// Run via: node --test test/phase10Lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYEES_PAGE_SIZE,
  SITES_PAGE_SIZE,
  TITLES_PAGE_SIZE,
  showMoreSlice,
  showingText,
  normalizeSearch,
  employeeMatchesSearch,
  splitByActive,
} from "../lib/listPaging.ts";
import { ALERTS_WINDOW_DAYS, ALERTS_MAX, alertsSince, alertsCapNote } from "../lib/alertsWindow.ts";
import { ALERT_ACTION_LOOKBACK_DAYS } from "../lib/dashboardOverviewUtils.ts";
import { approvalsQueryStart } from "../lib/approvalsWindow.ts";
import { DAY_PERCENTAGES, WEEK_PERCENTAGES, buildColumnWidths, approvalsColumnCount } from "../lib/approvalsColumns.ts";

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

test("page sizes: employees 20, job sites 10, titles 10", () => {
  assert.equal(EMPLOYEES_PAGE_SIZE, 20);
  assert.equal(SITES_PAGE_SIZE, 10);
  assert.equal(TITLES_PAGE_SIZE, 10);
});

test("show more: first page, then step by step, never past the end", () => {
  const items = range(57);
  const a = showMoreSlice(items, 20, 20);
  assert.equal(a.visible.length, 20);
  assert.equal(a.hidden, 37);
  assert.equal(a.nextStep, 20);
  const b = showMoreSlice(items, 40, 20);
  assert.equal(b.visible.at(-1), 40);
  const c = showMoreSlice(items, 60, 20);
  assert.equal(c.visible.length, 57);
  assert.equal(c.hidden, 0);
  assert.equal(c.nextStep, 0);
  assert.equal(showMoreSlice(range(45), 40, 20).nextStep, 5, "the button says only what is left");
  assert.equal(showMoreSlice(range(3), 10, 10).hidden, 0);
  assert.equal(showMoreSlice([], 10, 10).visible.length, 0);
  assert.equal(showMoreSlice(items, 0, 20).visible.length, 20, "never less than one page");
});

test("showing text: only while some are hidden", () => {
  assert.equal(showingText(20, 57), "Showing 20 of 57");
  assert.equal(showingText(57, 57), null);
  assert.equal(showingText(20, 3), null);
});

test("employee search: name or email, any case, accents ignored, every word must match (D10 a)", () => {
  const ana = { name: "Ana Lopez", email: "ana@acme.com" };
  const jose = { name: "Jos\u00e9 N\u00fa\u00f1ez", email: "jn@sub.co" };
  assert.equal(normalizeSearch("  Jos\u00e9   N\u00da\u00d1EZ "), "jose nunez");
  assert.equal(employeeMatchesSearch(ana, ""), true);
  assert.equal(employeeMatchesSearch(ana, "   "), true);
  assert.equal(employeeMatchesSearch(ana, "lop"), true);
  assert.equal(employeeMatchesSearch(ana, "ACME"), true, "email");
  assert.equal(employeeMatchesSearch(ana, "ana lopez"), true);
  assert.equal(employeeMatchesSearch(ana, "ana smith"), false);
  assert.equal(employeeMatchesSearch(jose, "jose"), true);
  assert.equal(employeeMatchesSearch(jose, "nunez"), true);
  assert.equal(employeeMatchesSearch({ name: "Ben" }, "ben"), true, "no email");
  assert.equal(employeeMatchesSearch({}, "x"), false);
});

test("active / inactive split keeps the order (D9 a)", () => {
  const list = [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }, { id: 4 }];
  const { active, inactive } = splitByActive(list);
  assert.deepEqual(active.map((e) => e.id), [1, 3]);
  assert.deepEqual(inactive.map((e) => e.id), [2, 4]);
});

test("Overview alerts: last 30 days (same as Ignore memory), at most 200, note when capped (W8 a)", () => {
  assert.equal(ALERTS_WINDOW_DAYS, 30);
  assert.equal(ALERTS_WINDOW_DAYS, ALERT_ACTION_LOOKBACK_DAYS);
  assert.equal(ALERTS_MAX, 200);
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(alertsSince(now).toISOString(), "2026-10-06T12:00:00.000Z");
  assert.equal(alertsCapNote(199), null);
  assert.equal(alertsCapNote(200), "Showing the newest 200 alerts from the last 30 days.");
});

test("approvals read from one day before the range start, never before the cutover (W8 a)", () => {
  const CUT = "2026-09-06";
  assert.equal(approvalsQueryStart("2026-11-02", CUT), "2026-11-01");
  assert.equal(approvalsQueryStart("2026-11-01", CUT), "2026-10-31", "month edge");
  assert.equal(approvalsQueryStart("2027-01-01", CUT), "2026-12-31", "year edge");
  assert.equal(approvalsQueryStart("2026-03-01", "2026-01-01"), "2026-02-28");
  assert.equal(approvalsQueryStart("2026-09-06", CUT), CUT);
  assert.equal(approvalsQueryStart("2026-08-01", CUT), CUT);
});

test("Timesheet Approvals: no Shift column; both layouts still add up to 100% (W6)", () => {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.equal(sum(DAY_PERCENTAGES), 100);
  assert.equal(sum(WEEK_PERCENTAGES), 100);
  assert.equal("shift" in DAY_PERCENTAGES, false);
  assert.equal("shift" in WEEK_PERCENTAGES, false);
  assert.equal(buildColumnWidths("day").length, approvalsColumnCount("day"));
  assert.equal(buildColumnWidths("week").length, approvalsColumnCount("week"));
  assert.equal(approvalsColumnCount("day"), 9);
  assert.equal(approvalsColumnCount("week"), 10);
  assert.equal(buildColumnWidths("day")[0], "40px");
});
