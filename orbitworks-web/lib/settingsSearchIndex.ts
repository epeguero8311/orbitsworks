import type { SettingsTabId } from "@/lib/hooks/useSettingsTabs";

// Single source of truth for the Settings search bar. One entry per
// individual setting row - `id` doubles as the DOM anchor id each card
// wraps its matching row with (see CompanyProfileCard.tsx etc.), so a
// search result can scroll to and highlight the exact row, not just the
// card it lives in. Add a new setting here whenever a new one is added to
// a card, and give its wrapper div the same id.
export interface SettingsSearchEntry {
  id: string;
  label: string;
  tab: SettingsTabId;
  keywords: string[];
  helperText?: string;
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // General
  {
    id: "company-name",
    label: "Company name",
    tab: "general",
    keywords: ["name", "profile", "company"],
  },
  {
    id: "company-logo",
    label: "Company logo",
    tab: "general",
    keywords: ["logo", "image", "branding", "upload"],
  },
  {
    id: "business-hours",
    label: "Business hours",
    tab: "general",
    keywords: ["open", "close", "hours", "schedule"],
    helperText: "Applies company-wide for now.",
  },
  {
    id: "grace-period",
    label: "Grace period",
    tab: "general",
    keywords: ["late", "grace", "minutes", "clock-in"],
    helperText: "Minutes after the scheduled start time before a clock-in counts as late.",
  },

  // Export Settings
  {
    id: "round-daily-minutes",
    label: "Round daily worked hours",
    tab: "export",
    keywords: ["rounding", "payroll", "daily"],
    helperText: "Each day's worked hours are rounded up. Shown in the Daily Breakdown.",
  },
  {
    id: "round-total-minutes",
    label: "Round total worked hours",
    tab: "export",
    keywords: ["rounding", "payroll", "total"],
    helperText: "The final payroll total is rounded up. Shown in the summary at the top.",
  },

  // Automations
  {
    id: "automatic-break-minutes",
    label: "Automatic Break",
    tab: "automations",
    keywords: ["break", "payroll", "deduction", "minutes"],
    helperText: "Deducted per shift, in addition to any real tracked break.",
  },
  {
    id: "minimum-shift-hours",
    label: "Minimum Shift Length",
    tab: "automations",
    keywords: ["shift", "minimum", "hours", "break"],
    helperText: "The Automatic Break only applies to shifts at least this long.",
  },
  {
    id: "auto-clock-out",
    label: "Auto clock-out",
    tab: "automations",
    keywords: ["clock out", "cap", "automatic", "hours", "worked"],
    helperText: "Automatically clocks an employee out once they've worked this many hours in a shift.",
  },

  // Alerts
  {
    id: "late-clockin-alert",
    label: "Late clock-in alert",
    tab: "alerts",
    keywords: ["late", "clock in", "overview"],
  },
  {
    id: "early-clockout-alert",
    label: "Early clock-out alert",
    tab: "alerts",
    keywords: ["early", "clock out", "overview"],
  },
  {
    id: "max-hours-warning",
    label: "Max hours warning",
    tab: "alerts",
    keywords: ["hours", "overtime", "max", "warning"],
  },
  {
    id: "overtime-warning",
    label: "Overtime warning",
    tab: "alerts",
    keywords: ["overtime", "pay", "multiplier", "hourly rate", "analytics"],
  },
  {
    id: "missed-clockout-alert",
    label: "Missed clock out alert",
    tab: "alerts",
    keywords: ["missed", "clock out", "overview"],
  },
  {
    id: "max-break-warning",
    label: "Max break time warning",
    tab: "alerts",
    keywords: ["break", "too long", "warning"],
  },
  {
    id: "outside-geofence-alert",
    label: "Clocked in outside geofence",
    tab: "alerts",
    keywords: ["geofence", "location", "outside", "pro"],
  },
  {
    id: "site-mismatch-alert",
    label: "Clocked in at unassigned site",
    tab: "alerts",
    keywords: ["site", "mismatch", "unassigned", "pro"],
  },
  {
    id: "face-recognition-alerts",
    label: "Face recognition alerts",
    tab: "alerts",
    keywords: ["face", "pro", "recognition", "biometric", "mismatch"],
  },

  // Mobile App
  {
    id: "allow-supervisor-override",
    label: "Allow supervisor override",
    tab: "mobile",
    keywords: ["supervisor", "override", "app"],
  },
  {
    id: "require-override-reason",
    label: "Require Reason for Supervisor Overrides",
    tab: "mobile",
    keywords: ["reason", "override", "supervisor"],
  },
  {
    id: "allow-app-employee-create",
    label: "Allow creating employees from the app",
    tab: "mobile",
    keywords: ["employee", "create", "app", "pin", "photo"],
  },
  {
    id: "allow-app-employee-update",
    label: "Allow updating employees from the app",
    tab: "mobile",
    keywords: ["employee", "update", "app", "photo"],
  },
  {
    id: "ask-job-site-each-time",
    label: "Ask for job site each time",
    tab: "mobile",
    keywords: ["job site", "clock in", "device"],
  },
  {
    id: "devices",
    label: "Devices",
    tab: "mobile",
    keywords: ["device", "phone", "pin", "lock", "pro"],
    helperText: "Devices seen clocking in for this company.",
  },
];

const MAX_RESULTS = 8;

// Case-insensitive substring match against label, keywords, and helper
// text, in that priority order - a label match ranks above a
// keyword/helper-text-only match, so searching "break" puts "Automatic
// Break" ahead of "Max break time warning"'s helper-text-only hit... both
// actually match on label here, but the ordering still holds for purely
// keyword/helper-text matches elsewhere. Capped to MAX_RESULTS so the
// dropdown never grows unbounded on a very broad query like "a".
export function searchSettings(query: string): SettingsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const labelMatches: SettingsSearchEntry[] = [];
  const otherMatches: SettingsSearchEntry[] = [];

  for (const entry of SETTINGS_SEARCH_INDEX) {
    if (entry.label.toLowerCase().includes(q)) {
      labelMatches.push(entry);
      continue;
    }
    const keywordHit = entry.keywords.some((k) => k.toLowerCase().includes(q));
    const helperHit = entry.helperText?.toLowerCase().includes(q) ?? false;
    if (keywordHit || helperHit) {
      otherMatches.push(entry);
    }
  }

  return [...labelMatches, ...otherMatches].slice(0, MAX_RESULTS);
}
