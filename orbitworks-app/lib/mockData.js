// TEMPORARY MOCK DATA - layout preview only. Nothing here is real or saved.
// Used by the Employee App Alerts tab (until Phase 7) and Settings (until
// Phase 5 Layer 7c). Delete this file (and its imports) once both are real.
// (The Sync tab, Last synced and the PIN row went real in Phase 4; History
// in Phase 5.)

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
  birthday: "January 1, 2000",
  notifications: true,
  location: true,
};
