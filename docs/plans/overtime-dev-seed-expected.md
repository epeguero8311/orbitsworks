# Task 1 (Overtime) - dev seed and expected export numbers

Seed: `orbitworks-web/functions/scripts/devSeedOvertime.js` (refuses every project except orbitworks-dev-ew).
```
cd orbitworks-web/functions
node scripts/devSeedOvertime.js --project orbitworks-dev-ew --admin-email <new email> --admin-password <8+ chars>          (dry run)
node scripts/devSeedOvertime.js --project orbitworks-dev-ew --admin-email <new email> --admin-password <8+ chars> --apply  (writes)
```
Company `ot-test-company` "OT Test Co" (Pro): Overtime ON, weekly 40, daily 8, multiplier 1.5, week starts Monday, no rounding, no Automatic Break.
Jobs: Laborer $15 | Foreman $23, OT rate $40 | Foreman B $23, no OT rate (= $34.50 via 1.5x; used by D and E).
Week: Mon Nov 16 - Sun Nov 22 2026 (America/Chicago). Every session is approved with its job.
Reports: run 2026-11-16 to 2026-11-22. Numbers below were computed with lib/reportOvertime.ts (the code the Reports page uses).

Note on B, C, D: the company runs daily 8, so these are laid out so the plan's totals still hold:
- B uses daily 8 instead of the plan's daily 12. It still shows "no double counting" (daily OT hours are not counted again toward weekly).
- C/D keep every day at 8h or less, so only weekly OT applies, as in the plan.

## A) Split shift, daily after 8 - "OT A Split Shift"
Mon 16: 8:00am-1:00pm + 2:00pm-11:00pm, Laborer
| Date | Job | Worked | OT | Est. Pay |
|---|---|---|---|---|
| Nov 16 | Laborer | 14.00 | 6.00 | $255.00 |
Summary: Worked 14.00, Overtime 6.00, Est. Pay $255.00 (8 x $15 + 6 x $22.50)

## B) Daily + weekly, no double count - "OT B Daily And Weekly"
Mon 16: 6:00am-8:00pm (14h); Tue 17 - Sat 21: 8:00am-4:00pm (8h each). Laborer.
| Date | Worked | OT | Est. Pay |
|---|---|---|---|
| Nov 16 | 14.00 | 6.00 (daily) | $255.00 |
| Nov 17-20 | 8.00 each | 0.00 | $120.00 each |
| Nov 21 | 8.00 | 8.00 (weekly) | $180.00 |
Summary: Worked 54.00, Overtime 14.00, Est. Pay $915.00
(regular = 8 + 32 = 40; Sat pushes regular to 48 -> 8 weekly OT; the 6 daily OT hours are not counted again)

## C) Weekly 40, two jobs, OT on Foreman at $40 - "OT C Two Jobs Fixed OT"
Mon-Wed 7am-3pm Laborer; Thu 7-8am Laborer + 8:30am-3:30pm Foreman; Fri 7am-3pm Foreman; Sat 7am-12pm Foreman.
| Date | Job | Worked | OT | Est. Pay |
|---|---|---|---|---|
| Nov 16-18 | Laborer | 8.00 each | 0.00 | $120.00 each |
| Nov 19 | Laborer | 1.00 | 0.00 | $15.00 |
| Nov 19 | Foreman | 7.00 | 0.00 | $161.00 |
| Nov 19 | Day total | 8.00 | 0.00 | $176.00 |
| Nov 20 | Foreman | 8.00 | 0.00 | $184.00 |
| Nov 21 | Foreman | 5.00 | 5.00 | $200.00 |
Summary: Worked 45.00, Overtime 5.00, Est. Pay $920.00 (plan: $375 + $345 + $200)

## D) Same as C, Foreman OT rate blank (1.5x) - "OT D Two Jobs Multiplier"
Same shifts as C with Foreman B.
Same rows as C except: Nov 19/20/21 job = Foreman B, and Nov 21 = 5.00 worked, 5.00 OT, $172.50.
Summary: Worked 45.00, Overtime 5.00, Est. Pay $892.50

## E) 2 jobs same day, daily after 8 - "OT E Two Jobs Same Day"
Tue 17: 7:00am-12:00pm Laborer; 12:30pm-5:30pm Foreman B
| Date | Job | Worked | OT | Est. Pay |
|---|---|---|---|---|
| Nov 17 | Laborer | 5.00 | 0.00 | $75.00 |
| Nov 17 | Foreman B | 5.00 | 2.00 | $138.00 |
| Nov 17 | Day total | 10.00 | 2.00 | $213.00 |
Summary: Worked 10.00, Overtime 2.00, Est. Pay $213.00
