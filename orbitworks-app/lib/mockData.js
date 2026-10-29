// TEMPORARY MOCK DATA - layout preview only. Nothing here is real or saved.
// Used by the Employee App Sync, Alerts and Settings tabs until they're wired
// to real data. Delete this file (and its imports) once they are.

// Sync tab: "online" or "offline". Flip to preview both states.
export const MOCK_SYNC_STATE = "offline";

export const MOCK_QUEUED_ITEMS = [
  { id: "q1", action: "Break End", employeeName: "Alex Sample", time: "12:32 PM" },
  { id: "q2", action: "Break Start", employeeName: "Alex Sample", time: "12:02 PM" },
  { id: "q3", action: "Clock out", employeeName: "Alex Sample", time: "Yesterday, 4:31 PM" },
];

// Alerts tab: true previews the "No alerts" empty state.
export const MOCK_ALERTS_EMPTY = false;

export const MOCK_ALERTS = [
  {
    id: "a1",
    title: "Still Clocked In",
    time: "4:30 PM",
    description: "You're still clocked in. Remember to clock out when you're done working.",
  },
  { id: "a2", title: "Break too Long", time: "12:32 PM", description: "Your break has gone over the scheduled 30 minutes." },
  { id: "a3", title: "5 min left", time: "12:25 PM", description: "You have 5 minutes left in your scheduled break." },
  { id: "a4", title: "Break Ending Soon", time: "12:28 PM", description: "Your break ends in 2 minutes." },
  { id: "a5", title: "Clock In Reminder", time: "7:05 AM", description: "Remember to clock in when you start working." },
];

// Settings tab: obviously fake values, never a real employee's.
export const MOCK_SETTINGS = {
  email: "alex.sample@example.com",
  pin: "1234",
  birthday: "January 1, 2000",
  lastSynced: "Jan 1, 2026 \u00b7 9:00 AM",
  notifications: true,
  location: true,
};

// History tab: true previews the "No hours yet" empty state.
export const MOCK_HISTORY_EMPTY = false;

// History tab: a flat list of clock events shaped like the real clockEvents
// ({ id, type, timestamp }), built relative to today so "Today" shows.
// lib/historyDays.js groups them into days. Day 4 is a day off.
function mockAt(daysAgo, time) {
  const [hh, mm] = time.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}
const MOCK_SHIFTS = [
  [0, [["in", "07:30"], ["breakStart", "12:02"], ["breakEnd", "12:32"], ["out", "15:42"]]],
  [1, [["in", "06:58"], ["breakStart", "10:00"], ["breakEnd", "10:15"], ["breakStart", "12:30"], ["breakEnd", "13:00"], ["out", "15:30"]]],
  [2, [["in", "08:00"], ["out", "12:15"]]],
  [3, [["in", "07:15"], ["breakStart", "11:45"], ["breakEnd", "12:15"], ["out", "16:05"]]],
  [5, [["in", "07:30"], ["breakStart", "12:00"], ["breakEnd", "12:45"], ["out", "16:00"]]],
  [6, [["in", "09:00"], ["breakStart", "13:00"], ["breakEnd", "13:20"], ["out", "17:10"]]],
];
export const MOCK_CLOCK_EVENTS = MOCK_SHIFTS.flatMap(([daysAgo, events]) =>
  events.map(([type, time], i) => ({ id: `mock-${daysAgo}-${i}`, type, timestamp: mockAt(daysAgo, time) }))
);
