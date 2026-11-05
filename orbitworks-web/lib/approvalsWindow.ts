// Phase 10 fix round 1 (W8 a, W7 item 5) - Reports and Analytics used to
// read every timesheet approval from APPROVALS_CUTOVER_DATE to the end of
// the range, so the read grew every day. Only sessions whose clock-in is in
// the range are gated (computeExcludedEventIds), so only approvals from the
// range's start are needed - one day earlier, because an approval's date is
// the clock-in's company-time date (Chicago) and the range starts at the
// browser's own midnight, which can be up to a day apart. Never before the
// cutover (no approval docs exist before it).
// No imports, so test/phase10Lib.test.mjs runs it under plain Node.

// rangeStart / cutover = "YYYY-MM-DD". -> the first approval date to read.
export function approvalsQueryStart(rangeStart: string, cutover: string): string {
  const [y, m, d] = rangeStart.split("-").map(Number);
  const dayBefore = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return dayBefore < cutover ? cutover : dayBefore;
}
