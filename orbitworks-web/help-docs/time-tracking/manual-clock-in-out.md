---
title: "Manually Clocking an Employee In, Out, or on Break"
category: time-tracking
keywords: [manual clock in, manual clock out, clock employee in, clock employee out, start break,
 end break, clock in from admin, clock in for someone, tablet down, override clock in,
 how do i clock someone in, manual entry, admin clock event]
---

## What
The Time Tracking page lets an admin manually create a clock-in, clock-out, start-break, or end-break event for an employee.

## Why
This is an exception path for when the normal face-match or supervisor-tablet flow isn't available - it's clearly logged as "Admin manual" so it's never confused with a real face-matched event.

## Where
Sidebar > Time Tracking > the manual entry form at the top of the page.

## How
1. Open Time Tracking.
2. Pick a clock direction: Clock in, Clock out, Start break, or End break.
3. Search or select the employee (optionally filter by job site).
4. Add a note if useful.
5. Submit. The event is recorded immediately.

## What you'll see
- Only employees eligible for the selected direction show up - e.g. picking "Clock in" hides anyone already clocked in.
- Clocking someone "out" while they're on break automatically logs an "End break" event first, so the break is closed out before the clock-out.
- If Settings has "Allow early clock in" or "Allow late clock out" turned off, clocking in before business open or out after business close is blocked with a message telling you to enable it in Settings.
