# Task 1 (Overtime) - dev seed and expected export numbers

Seed: `orbitworks-web/functions/scripts/devSeedOvertime.js` (refuses every project except orbitworks-dev-ew).
```
cd orbitworks-web/functions
node scripts/devSeedOvertime.js --project orbitworks-dev-ew --admin-email <email A> --admin-email-b <email B> --admin-password <8+ chars>          (dry run)
node scripts/devSeedOvertime.js --project orbitworks-dev-ew --admin-email <email A> --admin-email-b <email B> --admin-password <8+ chars> --apply  (writes)
```
Two companies (Pro, Overtime ON, weekly 40, multiplier 1.5, week starts Monday, no rounding, no Automatic Break), each with its own owner login:
- `ot-test-company` "OT Test Co": daily 8 - examples A, C, D, E.
- `ot-test-company-b` "OT Test Co B": daily 12 - example B exactly as in the plan.
Jobs: Laborer $15 | Foreman $23, OT rate $40 | Foreman B $23, no OT rate (= $34.50 via 1.5x; used by D and E).
Week: Mon Nov 16 - Sun Nov 22 2026 (America/Chicago). Every session is approved with its job.
Reports: run 2026-11-16 to 2026-11-22. Numbers below were computed with lib/reportOvertime.ts (the code the Reports page uses).

Note on C, D: OT Test Co runs daily 8, so every C/D day is 8h or less - only weekly OT applies, as in the plan.
(Earlier version of this seed put B in OT Test Co with an extra Saturday - that was wrong; fixed Nov 25.)

## A) Split shift, daily after 8 - "OT A Split Shift"
Mon 16: 8:00am-1:00pm + 2:00pm-11:00pm, Laborer
| Date | Job | Worked | OT | Est. Pay |
|---|---|---|---|---|
| Nov 16 | Laborer | 14.00 | 6.00 | $255.00 |
Summary: Worked 14.00, Overtime 6.00, Est. Pay $255.00 (8 x $15 + 6 x $22.50)

## B) Daily 12 + weekly 40, no double count - "OT B Daily And Weekly" in OT Test Co B
Company OT Test Co B: daily 12, weekly 40, 1.5x, Monday (sign in with the B owner email).
Mon 16: 6:00am-8:00pm (14h); Tue 17 - Fri 20: 8:00am-4:00pm (8h each). Laborer $15.
| Date | Worked | OT | Est. Pay |
|---|---|---|---|
| Nov 16 | 14.00 | 2.00 (daily) | $225.00 |
| Nov 17-19 | 8.00 each | 0.00 | $120.00 each |
| Nov 20 | 8.00 | 4.00 (weekly) | $150.00 |
Summary: Worked 46.00, Overtime 6.00, Est. Pay $735.00
(Mon 12 regular + 2 daily OT; regular 12 + 32 = 44 -> weekly OT 44 - 40 = 4, landing on Fri; total 2 + 4 = 6 - plan example B)

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
