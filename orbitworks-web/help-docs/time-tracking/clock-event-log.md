---
title: "Looking Up Clock Events"
category: time-tracking
keywords: [clock event log, find clock events, search clock history, source badge, face match,
 pin clock in, supervisor override, auto clock out, look up employee clock history,
 what does the badge mean, clock event source, view past clock ins]
---

## What
The Time Tracking page has a lookup tool to search past clock events by employee, job site, and date range, separate from the manual entry form above it.

## Why
Supervisors and admins need to trace exactly what happened for an employee - when they clocked in/out, from where, and by what method - without digging through raw Firestore data.

## Where
Sidebar > Time Tracking > the lookup section below the manual entry form.

## How
1. Open Time Tracking.
2. Set any combination of employee, job site, from-date, and to-date.
3. Click search. Results are capped at the 100 most recent matching events.
4. Click Clear to reset the filters and results.

## What you'll see
Each event shows a source badge explaining how it was recorded:
- **Face match** - the normal selfie/camera clock-in flow
- **PIN** / **Supervisor PIN** - PIN-based clock-in
- **Supervisor override** - a supervisor manually overrode the clock event
- **Admin manual** - entered from this Time Tracking page by an admin
- **Auto clock-out** / **Auto break end** - the system automatically closed out a shift or break left open from a prior day

If a search fails outright rather than returning zero results, that usually means a required Firestore index is missing for that filter combination.
