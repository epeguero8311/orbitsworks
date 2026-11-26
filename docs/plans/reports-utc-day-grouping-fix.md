# Fix - Reports group days by UTC date (evening shifts land on the next day)

Found: Nov 24, 2026 during Task 1 (Overtime). Status: **DONE Nov 26, 2026** - own commit on top of the stack (`feature/update-banner`, after the Reports first-run timing fix 20db598), per Emilio (not a separate branch off main). Dev only so far. See "Done" at the end.

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

## Done (Nov 26, 2026)
One day key for reports: `lib/overtime.ts` `overtimeDayKey` with the company time zone (`settings.timeZone` = company `timezone` field, else America/Chicago). No new helper.
- `lib/reportComputations.ts` `computePayrollAndSessions`: shift day = its start day in the company time zone (new last param `timeZone`, default America/Chicago). Covers hoursByEmployeeDay, breakHoursByEmployeeDay, tipsByEmployeeDay, time trends, so daily rounding, Payroll Hours Excel / Payroll CSV daily rows and the approvedJobIdByEmployeeDay lookup (keyed by timesheetApprovals.date) now agree with Approve Hours.
- `computeAttendanceAndSiteReports`: same day key (its break lookup is keyed by the payroll days).
- `lib/hooks/useReports.ts`: passes `settings.timeZone` to both.
- Reports page default range (`components/reports/ReportsPageView.tsx`): this week (Monday) to today in the company time zone (`lib/reportUtils.ts` `defaultReportRange`), set when the settings load, before the first run.
- Time History (Overtime OFF) week grouping (`lib/hooks/useEmployeeTimesheet.ts`): `overtimeWeekKey(overtimeDayKey(start, tz), 1)` (Monday weeks, as before).
- Tests: `test/reportsTimeZone.test.mjs` (7pm-11pm shift on its start day in payroll, Excel day rows, approved job + tips, attendance, trends; non-Chicago company; default range; Time History week; OT Test Co Emilio Nov 25 7:10 PM shift stays on Nov 25).

Not changed (left as is):
- The report's date-range query still starts/ends at the browser's local midnight (`new Date(date + "T00:00:00")`). Same as company midnight when the browser is in the company time zone; fixing it needs a time-zone-to-instant helper, which this fix was told not to add.
- Other pages that still use the UTC `dateKey`: Site Costs (`lib/siteCosts.ts`, `useSiteCosts.ts`), Approve Hours week navigation, dashboard day view, `lib/validators/dateRange.ts` presets. Not Reports; separate follow-up if wanted.

## Known follow-ups (not fixed - Emilio, Nov 26)
1. Still grouping by the UTC date (`lib/reportUtils.ts` `dateKey`): Approve Hours week navigation (`app/dashboard/timesheet-approvals/page.tsx`, `lib/hooks/useTimesheetApprovals.ts` fetch window), dashboard day view (`components/dashboard/ClockEventsDayView.tsx`), Site Costs (`lib/siteCosts.ts`, `lib/hooks/useSiteCosts.ts`), date presets (`lib/validators/dateRange.ts`).
2. The report date query (`lib/hooks/useReports.ts`, also Time History) starts/ends at the browser's local midnight (`new Date(date + "T00:00:00")`), not company midnight. Only differs when the admin's browser is in another time zone than the company.

Release notes: evening shifts (after ~6pm Chicago, 7pm in summer) in Overtime-OFF reports and exports now show on the day they started - old reports re-run will move those shifts back one day.
