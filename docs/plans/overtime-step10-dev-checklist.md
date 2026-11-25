# Task 1 (Overtime) - Step 10 test checklist (dev: orbitworks-dev-ew)

Branch feature/overtime (eb6c243). On dev already: firestore.rules (steps 1+3) and all 75 functions (after step 8).
NOT on dev: the website itself. Test on localhost (`npm run dev` in orbitworks-web, which reads .env.development.local = dev),
or deploy the dev site first with `powershell -File scripts\dev-site-deploy.ps1` (your call).
Never `npm start` (that build uses .env.production.local = prod).

Expected numbers: docs/plans/overtime-dev-seed-expected.md. Mark each line OK / FAILED.

## 0. Setup
- [ ] Browser DevTools > Network > filter `firestore.googleapis.com`: requests say `projects%2Forbitworks-dev-ew`.
- [ ] Seed (two new emails, not already in a company):
      `cd orbitworks-web/functions` then
      `node scripts/devSeedOvertime.js --project orbitworks-dev-ew --admin-email <A> --admin-email-b <B> --admin-password <8+>` (dry run),
      then the same with `--apply`. It ends with "Done."
- [ ] Sign in with email A: "OT Test Co" opens (Pro, daily 8). Sign in with email B: "OT Test Co B" (Pro, daily 12).

## 1. Settings
- [ ] Export Settings: Overtime ON; Weekly overtime after 40; Daily overtime after 8; Week starts on Monday.
- [ ] Overtime Pay: Multiplier 1.5 + the note about paying OT at the job's rate.
- [ ] Rounding: Round overtime hours = Off (options Off/5/15/30).
- [ ] Alerts > Overtime warning: on/off only, text "Fires at 40 hours/week. Change it in Export Settings > Overtime."
      Max hours warning: "With Overtime on (Export Settings), counts all of the day's shifts together."
- [ ] Daily overtime after = 25 then Save: error "can't be more than 24 hours", nothing saved. Put back 8.
- [ ] Settings search "overtime": finds Overtime, Weekly/Daily overtime after, Week starts on, Overtime pay multiplier, Round overtime hours, Overtime warning.
- [ ] ShipMate (or any other dev company): Export Settings shows Overtime OFF, and its old weekly number + multiplier are unchanged.

## 2. Titles & Pay
- [ ] Overtime rate column: Laborer "Multiplier", Foreman $40.00/hr, Foreman B "Multiplier".
- [ ] Add a title $20 with OT rate $25: amber "below 1.5x ($30.00). It will still save." It saves; the table shows "Below 1.5x".
- [ ] Edit Foreman B: OT rate $40: "Effective from" prompt appears; save. Then set it back to blank (effective date before Nov 16) so D/E match again.
      (Exports use the CURRENT OT rate; Analytics uses the rate as of each day.)

## 3. Reports (2026-11-16 to 2026-11-22) - compare with the expected doc
- [ ] OT Test Co: Payroll table has an Overtime column; A 6.00 / $255.00, C 5.00 / $920.00, D 5.00 / $892.50, E 2.00 / $213.00.
- [ ] OT Test Co B: B 6.00 / $735.00; Daily breakdown Mon Nov 16 = 14.00 worked / 2.00 OT / $225.00, Fri Nov 20 = 8.00 / 4.00 / $150.00.
- [ ] Daily breakdown has an Overtime column right after Worked Hours.
- [ ] Nov 17: E splits into Laborer 5.00 / 0.00 / $75.00, Foreman B 5.00 / 2.00 / $138.00, Day total 10.00 / 2.00 / $213.00. Job rows have no dropdown.
- [ ] Nov 19: C and D split into Laborer 1h + Foreman(B) 7h + Day total 8h.
- [ ] Single-job day dropdown still works: Nov 16 for A, pick Foreman: pay becomes 8 x $23 + 6 x $40 = $424.00 (OT hours unchanged). Refresh resets it.
- [ ] Payroll CSV: Overtime columns in both tables, Day total rows, same numbers.
- [ ] Payroll Hours Excel (and Full Report): Overtime column after Worked Hours in both blocks; Day total rows; summary totals match.
      In Excel, change the Job on a single-job day (e.g. A Nov 16 -> Foreman): Est. Pay and the summary update (OT at $40).
- [ ] Time History Excel (Clock events > pick "OT C Two Jobs Fixed OT", dates Nov 16-22 > Excel): Overtime column; week row Overtime 5.00, Est. Pay $920.00.
- [ ] Turn Overtime OFF and Refresh: no Overtime column anywhere, Daily breakdown/Excel/CSV look exactly like before. Turn it back ON.

## 4. Approve Hours (week of Nov 16)
- [ ] OT A rows (Nov 16): both show Max hours "Worked 14.0h today (all shifts), limit 12h". The 2pm row shows "6.00h overtime on this shift".
- [ ] Frozen OT: set A's 2pm row to Pending, approve it again. Then change Daily overtime after to 6 and Save:
      Reports still shows A = 6.00 OT for that day (frozen). Put daily back to 8.
- [ ] Re-approve warning (OT Test Co B): set B's Tue Nov 17 row to Pending, then set B's Fri Nov 20 row Pending and approve it again
      (freezes Fri = 4h weekly OT). Now adjust Tue's clock-out 1 hour EARLIER (3:00pm; Tue still pending). Regular hours before Fri
      drop by 1, so open Fri's review: "Overtime changed - re-approve" (4.00h -> 3.00h). Set Fri to Pending and approve again: gone.
- [ ] Frozen rates (4B): in OT Test Co, set A's 2pm row Pending and approve again (freezes $15 / $22.50). Raise Laborer to $16
      (effective date before Nov 16): Reports A Nov 16 now = 5h at $16 for the 8am row (live, seed approval has no freeze) +
      the 2pm row still at $15 / $22.50 -> shown as two Laborer rows + Day total. Put Laborer back to $15.
- [ ] Automatic Break once per day: set Automatic Break 30 min, minimum shift 6h. Set both A rows to Pending: only the 2pm row shows the 0.5h break.
      (Approved rows keep the break frozen at approval.) Put Automatic Break back to 0.
- [ ] Overtime OFF: the rows' warnings go back to per shift (no "today (all shifts)", no per-shift OT text).

## 5. Alerts (live; sweep runs every 15 min, auto clock-out every 5 min)
Use a fresh employee in OT Test Co and admin-entered punches for TODAY.
- [ ] Max hours combined: closed shift 8:00-13:00 today + clock in at 14:00, Max hours 12: alert "Worked too many hours today"
      appears on Overview once the day reaches 12h (about 9pm), not before. Only one alert that day.
- [ ] Daily OT warning: once today's worked passes 8h: Overview shows "<Name> has reached overtime (8.xh)". Only one per day.
- [ ] Weekly warning text: any employee past 40h this week: "<Name> has reached overtime (40.xh)".
- [ ] ShipMate (Overtime OFF): its Overtime alert shows the new text, logic otherwise as before; Max hours still per shift.
- [ ] Employee app (if you have one linked): Overtime = "You have worked X hours today/this week"; Max hours = "... hours today".

## 6. Automations - auto clock-out (Settings > Automations: on, 12h)
- [ ] Overtime ON: closed shift 5h earlier today + open shift: auto clock-out lands 7h into the open shift. The earlier shift is untouched.
- [ ] With Automatic Break 30 min / min shift 6h and an earlier 7h shift (6.5h worked): auto clock-out after 5.5h of the open shift.
- [ ] Overtime OFF company: only the open shift counts (12h of it).

## 7. Analytics (Pro) - Job Site Cost, Nov 16-22
- [ ] Totals: labor cost = sum of the export Est. Pay: OT Test Co $2,280.50 (A+C+D+E); OT Test Co B $735.00.
- [ ] OT split by site: give OT A's two Nov 16 shifts two different sites (5h Site A, 9h Site B; Approve Hours > Site): Site A OT 2.14h, Site B 3.86h.
- [ ] Overtime OFF: Analytics shows what it showed before (decision 26: kept as today).

## Open questions
All answered Nov 25 (plan decisions 26-31). Follow-up: employee app My Hours - Automatic Break once per day (later app release).
