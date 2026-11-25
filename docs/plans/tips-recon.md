# Task 3 (Tips) - Step 0 recon (Nov 25, 2026)

Branch: feature/tips (off feature/approve-columns). Recon only - no code yet. Decisions below are proposals; Emilio picks before building.

## Findings

**1. The shift modal.** It's `components/dashboard/timesheetApprovals/sessionReview/SessionReviewModal.tsx`, which opens when you click a row. Its right column holds "Session Alerts", and that's the natural place for a Tips card (amount, Save, "Last edited by {Name}", info icon, history list) because it doesn't depend on the session being pending. The time-editing controls are locked once a session is approved; Tips would not be.

**2. Data model.** What I found:
- Every clock-in gets a `timesheetApprovals/{clockInEventId}` doc when it's created (`onClockEventCreated`, `functions/src/clockEvents.ts:506`). Older shifts can lack one, and `setApprovalStatus` creates one when needed.
- Clients can never write that doc (`allow write: if false`). It's only written server-side.
- Approve Hours, Reports, Time History and Analytics already read approvals with one date-range query each, so anything stored on the approval doc comes free, with no per-row queries.

Options:
- **A★: Tip amount + "last edited" on the approval doc; full history in a subcollection `timesheetApprovals/{id}/tipEdits/{autoId}`; a new server function `setShiftTip` writes both in one transaction.**
  - The history can't be edited or deleted, because clients can't write there at all.
  - The admin name is looked up on the server, so it can't be spoofed.
  - The function can create the approval doc if it's missing.
  - The full history is read only when someone clicks the info icon.
  - Cost: a new function to deploy (dev now, prod at ship).
- **B: Same as A, but the history is an array on the approval doc.** Simpler, but every range listener downloads every history entry, and the doc grows forever.
- **C: A separate `shiftTips/{clockInEventId}` doc written directly from the browser, with rules keeping the history append-only.** No function needed, but each page needs one more range query, the rules get complex, and the admin name can't be verified.

**3. Rules and validation.**
- With A or B, the rules don't change: the server function checks for owner or admin, and supervisors and both apps can't read approvals at all (admin/owner only).
- Append-only history in the rules alone (option C) is possible in principle but fiddly; I'd only trust it after emulator tests.
- Validation (zod): the amount is non-negative, has at most 2 decimals, and is at most $10,000. I'd store it in whole cents to avoid rounding errors.

**4. Keeping tips separate from approval.**
- Writing tips through `setApprovalStatus` would re-freeze the OT with the *current* settings, so frozen OT could change without anyone noticing. Tips must be their own function.
- Any `.set()` without merge on the approval doc wipes tips, status and frozen OT. Today that only happens on create or self-heal, but the tip function must only ever `update`.
- The re-approve warning is calculated from the clock events, not the approval doc, so a tip change can't trigger it.
- No trigger watches `timesheetApprovals`.

**5. Settings.**
- Add `tipsEnabled` as a top-level company field (default OFF), with zod and a rules type check, just like Task 1's fields. The employee-app settings copy only picks specific fields, so it won't leak.
- Turning it OFF hides the field in the modal and leaves tips out of the export. I'd keep saved tips, so they come back when it's turned on again.

**6. Columns modal.** Add a `tips` key to `lib/approvalsColumns.ts`, the zod list and the rules' allowed list, greyed out while Tips is OFF (same as D2) and counted toward the 8. The column logic already supports this; it's one more entry.

**7. Export.**
- Placement: Tips goes right before Est. Pay in both Summary and Daily Breakdown, after the Task 1 hours and rate columns.
- Excel:
  - Overtime ON daily: Est. Pay stays a live formula, `D*G + M*H + Tips`.
  - Overtime OFF daily: `D*G + Tips`.
  - The summary and Day total rows already add up the Est. Pay column, so tips are included automatically.
- 2-job days: a tip goes on its own shift's job row. Two shifts on the same job and day merge into one row and their tips add up.
- Tips apply to every plan whether Overtime is ON or OFF. That means touching the Overtime-OFF code that Task 1 deliberately left untouched (`toPayrollCsv`, `addPayrollSheet`, `addEmployeeHistorySheet`, `reportComputations`).

**8. Plan example.** Example E's day is $213. A $45 tip on its Foreman B shift should give that row $183.00 and the Day total $258.00. I'd use that as the dev test.

**9. Other places that show pay:**

| Place | Shows pay today | Tips? |
|---|---|---|
| Reports page (Summary + Daily Breakdown tables) | yes | yes |
| Payroll CSV + Payroll Hours Excel (incl. Full Report) | yes | yes |
| Time History Excel (Time Tracking lookup) | yes | yes★, so it matches payroll |
| Analytics (cost per site) | wages | no★, labor cost stays wages |
| Overview | no pay | nothing |
| Employee app / supervisor app | no pay anywhere; can't read approvals | nothing |

**10. Edge cases:**
- **Session deleted:** the approval doc is deleted, so the tip goes with it. The history subcollection would be left behind, so it should be deleted too, or kept for audit (D7).
- **Times edited or session moved:** the tip stays. When a session is moved to another employee, the tip follows the shift to the new employee.
- **Employee-app late punch replacing a hand-entered shift:** that shift's approval doc is deleted, so its tip is lost.
- **Subcontractor employees:** same as everyone else.
- **Missing clock-out:** only closed shifts get a row in Approve Hours, so tips can only be entered after clock-out.
- **Pending shifts:** Reports count approved hours only, so a tip on a pending shift is left out until it's approved.

**11. Task 4 conflicts.** Is editing tips "Edit pay rates & wages" or "Approve hours"? It's a pay amount, so I lean towards pay. Site-restricted admins would only see and edit tips on their own sites' shifts, while the export still shows everything. Doing tips through a server function (option A) makes Task 4's server-side checks easy to add.

## Decisions
- **D1 Storage:** A★ (approval doc + history subcollection + server function: can't be tampered with, and no extra reads) / B (history array) / C (separate doc, browser writes)
- **D2 Amount unit:** A★ whole cents / B dollars with 2 decimals. Cents avoid rounding errors.
- **D3 Max tip:** A★ $10,000 / B $1,000 / C no max. Catches typos without blocking real tips.
- **D4 Toggle OFF:** A★ keep saved tips, just hidden / B clear them. Nothing is lost.
- **D5 Tips on pending shifts in Reports:** A★ left out until approved, same as hours / B always counted.
- **D6 Time History Excel:** A★ include Tips / B leave out. Matches payroll.
- **D7 History when a session is deleted:** A★ delete it with the session / B keep it (it would never show anywhere).
- **D8 Analytics:** A★ leave tips out (wages only) / B add tips to cost.
- **D9 Overtime-OFF exports:** A★ Tips in both the ON and OFF paths (plan says all plans) / B Tips only with Overtime ON.
- **D10 Where the Tips card sits in Session review:** A★ right column, above Session Alerts / B footer, next to Approve.

## Proposed build order (Task 3)
1. Types: `tipsEnabled`, the tip fields on `TimesheetApproval`, the `tipEdits` shape.
2. Validators: the tip amount, the `tipsEnabled` setting, and the `tips` column key.
3. Rules: `tipsEnabled` type check, `tips` in the allowed column list, `tipEdits` read for admin/owner only and no client writes, plus emulator tests.
4. Server: the `setShiftTip` function (owner/admin, transaction, name looked up on the server, creates the approval doc if missing, update only), and `deleteTimesheetSession` removing `tipEdits`. Tests.
5. Hooks: `useCompanySettings` gets `tipsEnabled`; Approve Hours rows get `tipCents` / last edited; a hook for loading the history.
6. Components: the Tips toggle in Export Settings and the settings search index; the Tips card in Session review; the Tips column.
7. Page wiring.
8. Export: Reports page tables, Payroll CSV, Payroll Hours Excel (ON and OFF), Time History Excel, with Est. Pay including tips. Tests with the E + $45 = $258 case.
9. Deploy rules and the function to dev, then the dev test.
