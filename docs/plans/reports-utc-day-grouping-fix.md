# Fix - Reports group days by UTC date (evening shifts land on the next day)

Found: Nov 24, 2026 during Task 1 (Overtime). Status: NOT fixed. Do it on its own branch off main AFTER Task 1 ships.

## The bug
- `lib/reportUtils.ts` `dateKey(d)` returns `d.toISOString().slice(0, 10)`: the UTC date, not the company's local date.
- `lib/reportComputations.ts` `computePayrollAndSessions` keys every shift by `dateKey(pendingIn.timestamp.toDate())` (hoursByEmployeeDay, breakHoursByEmployeeDay, daily trends).
- Chicago is UTC-6 (CST) / UTC-5 (CDT), so any shift that starts after about 6pm (7pm in summer) Chicago time is grouped under the NEXT day.
```
Shift starts Tue Nov 10 7:00pm Chicago = Wed Nov 11 01:00 UTC
Reports Daily Breakdown / Payroll Excel show it on Wed Nov 11 (wrong)
Approve Hours (timesheetApprovals.date, server Chicago day) shows Tue Nov 10 (right)
```
- `lib/reportUtils.ts` already has a comment warning about this ("dateKey() below is UTC-based and disagrees with the server's Chicago-anchored date for any evening event").

## Where it shows (Overtime OFF paths)
- Reports page: Daily breakdown, Payroll summary daily rounding, time trends.
- Payroll Hours Excel + Payroll CSV daily rows; approvedJobIdByEmployeeDay lookups (Approve Hours job by employee+day) can miss for evening shifts.
- Time History Excel week grouping (`useEmployeeTimesheet.ts` uses `dateKey(startOfWeek(...))`).
- The report date range itself uses the browser's local midnight (`new Date(date + "T00:00:00")`).

## Not affected
- Task 1 Overtime ON paths: they use `lib/overtime.ts` `overtimeDayKey` (company time zone, else America/Chicago).

## Suggested fix (to plan + OK with Emilio first)
- Use one company-time-zone day key everywhere in reports (same helper as overtime: company `timezone` field, else America/Chicago).
- Re-check: daily rounding totals, approvedJobIdByEmployeeDay, Excel/CSV, trends, Time History weeks.
- Tests: a 7pm-11pm shift must land on its start day in every report and export.
- This changes which day existing evening shifts appear on in old reports - call that out in the release notes.
