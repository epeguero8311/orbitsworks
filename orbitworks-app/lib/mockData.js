// TEMPORARY MOCK DATA - layout preview only. Nothing here is real or saved.
// Used only by the Employee App Alerts tab until Phase 7 wires it to real
// alerts. Delete this file (and its import) then.
// (Sync, Last synced and the PIN row went real in Phase 4; History and
// Settings in Phase 5.)

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
