// Unit tests for lib/joinCodes/time.ts (join code expiry, company timezone).
// Plain Node, no emulator. Node 24+ loads the .ts file directly (type stripping).
// Run via: node --test test/joinCodeTime.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPANY_TIMEZONE,
  companyLocalToIso,
  formatCompanyDateTime,
  msToCompanyLocal,
} from "../lib/joinCodes/time.ts";

// Would have caught the Phase 1 crash: dateStyle/timeStyle mixed with
// timeZoneName throws "Invalid option" in V8 (Node and Chrome alike).
test("formatCompanyDateTime does not throw and shows the company time + zone", () => {
  assert.equal(formatCompanyDateTime(Date.UTC(2026, 9, 22, 22, 30)), "Oct 22, 2026, 5:30 PM CDT");
  assert.equal(formatCompanyDateTime(Date.UTC(2026, 11, 1, 18, 5)), "Dec 1, 2026, 12:05 PM CST");
});

test("formatCompanyDateTime honors an explicit timezone", () => {
  assert.equal(formatCompanyDateTime(Date.UTC(2026, 0, 15, 12, 0), "UTC"), "Jan 15, 2026, 12:00 PM UTC");
});

test("companyLocalToIso converts Central wall time to UTC across DST", () => {
  assert.equal(companyLocalToIso("2026-07-01T12:00"), "2026-07-01T17:00:00.000Z");
  assert.equal(companyLocalToIso("2026-12-01T12:00"), "2026-12-01T18:00:00.000Z");
  assert.equal(companyLocalToIso("not a date"), null);
});

test("msToCompanyLocal round-trips with companyLocalToIso", () => {
  for (const local of ["2026-03-08T01:30", "2026-07-04T09:15", "2026-11-01T23:45"]) {
    assert.equal(msToCompanyLocal(Date.parse(companyLocalToIso(local))), local);
  }
});

test("COMPANY_TIMEZONE matches lib/reportUtils.ts", () => {
  const src = readFileSync(new URL("../lib/reportUtils.ts", import.meta.url), "utf8");
  assert.match(src, new RegExp(`export const COMPANY_TIMEZONE = "${COMPANY_TIMEZONE}";`));
});
