// Approve Hours (Timesheet Approvals) table columns. No imports, so the
// tests run it under plain Node (test/approvalsColumns.test.mjs,
// test/phase10Lib.test.mjs).
//
// Task 2 (customizable columns, decisions D1-D10 in
// docs/plans/overtime-columns-tips-plan.md):
// - Saved per COMPANY as the top-level company field `approvalsColumns`:
//   a list of the OPTIONAL column keys only. Name and Status are always on
//   and never stored. Field missing = DEFAULT_APPROVALS_COLUMNS (today's
//   table, so a company that never opens the Columns modal sees no change).
// - Max 8 columns counting Name + Status = max 6 optional keys. The
//   checkbox and the week-mode Date column are not columns here.
// - Show/hide only: columns always draw in APPROVALS_COLUMNS order.
// - Pro-only columns (Type, Device) are hidden while the company is not on
//   Pro (D5/D6). Overtime-only columns (Regular Hours, Overtime) are hidden
//   while the Overtime toggle is OFF (D2) - both stay in the saved list.
//   firestore.rules (validCompanyApprovalsColumns) mirrors the key list,
//   the max and the Pro check; lib/validators/approvalsColumns.ts too.
//
// Widths: the checkbox column is a fixed 40px. Every other column gets a
// share of the table's width from its weight, scaled down by the same 40px
// (via calc) so the columns always sum to exactly 100% of the card - the
// table never needs a horizontal scrollbar on a desktop window. The default
// layout's weights sum to exactly 100, so it keeps the Phase 10 widths
// (W6, D13 a) to the percent.

export const CHECKBOX_COLUMN_WIDTH = "40px";
const CHECKBOX_COLUMN_PX = 40;

export const REQUIRED_APPROVALS_COLUMNS = ["name", "status"] as const;

export const OPTIONAL_APPROVALS_COLUMNS = [
  "company",
  "site",
  "job",
  "time",
  "break",
  "regularHours",
  "overtimeHours",
  "worked",
  "clockInType",
  "clockOutType",
  "clockInDevice",
  "clockOutDevice",
] as const;

export type RequiredApprovalsColumnKey = (typeof REQUIRED_APPROVALS_COLUMNS)[number];
export type OptionalApprovalsColumnKey = (typeof OPTIONAL_APPROVALS_COLUMNS)[number];
export type ApprovalsColumnKey = RequiredApprovalsColumnKey | OptionalApprovalsColumnKey;

export const MAX_APPROVALS_COLUMNS = 8;
export const MAX_OPTIONAL_APPROVALS_COLUMNS = MAX_APPROVALS_COLUMNS - REQUIRED_APPROVALS_COLUMNS.length;

export const PRO_APPROVALS_COLUMNS: readonly OptionalApprovalsColumnKey[] = [
  "clockInType",
  "clockOutType",
  "clockInDevice",
  "clockOutDevice",
];

export const OVERTIME_APPROVALS_COLUMNS: readonly OptionalApprovalsColumnKey[] = ["regularHours", "overtimeHours"];

// D1: today's table (Site included - the plan left it out by mistake).
export const DEFAULT_APPROVALS_COLUMNS: readonly OptionalApprovalsColumnKey[] = [
  "company",
  "site",
  "job",
  "time",
  "break",
  "worked",
];

export type ApprovalsColumnDef = {
  key: ApprovalsColumnKey;
  // Table header text.
  label: string;
  // Header hover tooltip - only on the new hours columns, with the Task 1
  // descriptions (lib/hoursColumns.ts). Today's columns get none, so the
  // default table is unchanged.
  help?: string;
  pro: boolean;
  overtimeOnly: boolean;
  // Width weights. Default layout: day 18+11+10+12+18+7+7+17 = 100,
  // week 15+10+10+12+14+7+7+17 = 92 + Date 8 = 100 (the Phase 10 widths).
  dayWeight: number;
  weekWeight: number;
};

// Display order (show/hide only, no reorder). The hours columns follow the
// Task 1 order: Break | Regular Hours | Overtime | Total Worked.
export const APPROVALS_COLUMNS: readonly ApprovalsColumnDef[] = [
  { key: "name", label: "Name", pro: false, overtimeOnly: false, dayWeight: 18, weekWeight: 15 },
  { key: "company", label: "Company", pro: false, overtimeOnly: false, dayWeight: 11, weekWeight: 10 },
  { key: "site", label: "Site", pro: false, overtimeOnly: false, dayWeight: 10, weekWeight: 10 },
  { key: "job", label: "Job", pro: false, overtimeOnly: false, dayWeight: 12, weekWeight: 12 },
  { key: "time", label: "Time", pro: false, overtimeOnly: false, dayWeight: 18, weekWeight: 14 },
  { key: "break", label: "Break", pro: false, overtimeOnly: false, dayWeight: 7, weekWeight: 7 },
  {
    key: "regularHours",
    label: "Regular Hours",
    help: "Hours up to the OT threshold",
    pro: false,
    overtimeOnly: true,
    dayWeight: 8,
    weekWeight: 8,
  },
  {
    key: "overtimeHours",
    label: "Overtime",
    help: "Hours over the OT threshold",
    pro: false,
    overtimeOnly: true,
    dayWeight: 8,
    weekWeight: 8,
  },
  { key: "worked", label: "Worked", pro: false, overtimeOnly: false, dayWeight: 7, weekWeight: 7 },
  { key: "clockInType", label: "Clock-in Type", pro: true, overtimeOnly: false, dayWeight: 10, weekWeight: 10 },
  { key: "clockOutType", label: "Clock-out Type", pro: true, overtimeOnly: false, dayWeight: 10, weekWeight: 10 },
  { key: "clockInDevice", label: "Clock-in Device", pro: true, overtimeOnly: false, dayWeight: 11, weekWeight: 11 },
  { key: "clockOutDevice", label: "Clock-out Device", pro: true, overtimeOnly: false, dayWeight: 11, weekWeight: 11 },
  { key: "status", label: "Status", pro: false, overtimeOnly: false, dayWeight: 17, weekWeight: 17 },
];

const DATE_WEEK_WEIGHT = 8;

// Columns modal names (longer than the table headers).
export const APPROVALS_COLUMN_MODAL_LABELS: Record<ApprovalsColumnKey, string> = {
  name: "Name",
  company: "Company",
  site: "Site",
  job: "Job",
  time: "Time",
  break: "Break",
  regularHours: "Regular Hours",
  overtimeHours: "Overtime Hours",
  worked: "Worked",
  clockInType: "Clock-in Type",
  clockOutType: "Clock-out Type",
  clockInDevice: "Clock-in Device",
  clockOutDevice: "Clock-out Device",
  status: "Status",
};

const OPTIONAL_SET = new Set<string>(OPTIONAL_APPROVALS_COLUMNS);

export function isOptionalApprovalsColumn(key: unknown): key is OptionalApprovalsColumnKey {
  return typeof key === "string" && OPTIONAL_SET.has(key);
}

// The company doc's raw `approvalsColumns` -> the saved optional keys, or
// null when the company never saved a choice (= use the default). Unknown
// keys and duplicates are dropped and the list is capped at the max, so a
// bad value can never break the table (firestore.rules refuses them anyway).
export function readSavedApprovalsColumns(raw: unknown): OptionalApprovalsColumnKey[] | null {
  if (!Array.isArray(raw)) return null;
  const out: OptionalApprovalsColumnKey[] = [];
  for (const key of raw) {
    if (isOptionalApprovalsColumn(key) && !out.includes(key)) out.push(key);
  }
  return out.slice(0, MAX_OPTIONAL_APPROVALS_COLUMNS);
}

// The optional keys the company has turned on (saved, else the default) -
// including Pro / Overtime ones that are hidden right now.
export function selectedApprovalsColumns(
  saved: readonly OptionalApprovalsColumnKey[] | null
): OptionalApprovalsColumnKey[] {
  return [...(saved ?? DEFAULT_APPROVALS_COLUMNS)];
}

export type ApprovalsColumnsContext = { isPro: boolean; overtimeEnabled: boolean };

// Why a selected column is not drawn right now (null = it is drawn).
export function approvalsColumnHiddenReason(
  key: ApprovalsColumnKey,
  ctx: ApprovalsColumnsContext
): "pro" | "overtime" | null {
  if (!ctx.isPro && (PRO_APPROVALS_COLUMNS as readonly string[]).includes(key)) return "pro";
  if (!ctx.overtimeEnabled && (OVERTIME_APPROVALS_COLUMNS as readonly string[]).includes(key)) return "overtime";
  return null;
}

// The columns the table draws, in display order: Name + Status + the
// selected optional ones that aren't hidden by the plan or Overtime.
export function visibleApprovalsColumns(
  saved: readonly OptionalApprovalsColumnKey[] | null,
  ctx: ApprovalsColumnsContext
): ApprovalsColumnKey[] {
  const selected = new Set<string>(selectedApprovalsColumns(saved));
  return APPROVALS_COLUMNS.filter(
    (c) =>
      (REQUIRED_APPROVALS_COLUMNS as readonly string[]).includes(c.key) ||
      (selected.has(c.key) && approvalsColumnHiddenReason(c.key, ctx) === null)
  ).map((c) => c.key);
}

// What the Columns modal saves. Off a Pro plan, Pro keys are dropped
// (firestore.rules refuses them there - D6: they stay saved only until the
// next save). Overtime keys stay (D2: they come back when Overtime is on).
// Kept in display order.
export function approvalsColumnsToSave(
  selected: readonly OptionalApprovalsColumnKey[],
  ctx: Pick<ApprovalsColumnsContext, "isPro">
): OptionalApprovalsColumnKey[] {
  const set = new Set<string>(selected);
  return OPTIONAL_APPROVALS_COLUMNS.filter(
    (k) => set.has(k) && (ctx.isPro || !(PRO_APPROVALS_COLUMNS as readonly string[]).includes(k))
  );
}

// Modal counter: Name + Status + every selected optional column that still
// takes a slot. Hidden Overtime columns count (they stay saved); Pro
// columns off a Pro plan don't (they are dropped on save).
export function approvalsColumnsUsed(
  selected: readonly OptionalApprovalsColumnKey[],
  ctx: Pick<ApprovalsColumnsContext, "isPro">
): number {
  return REQUIRED_APPROVALS_COLUMNS.length + approvalsColumnsToSave(selected, ctx).length;
}

export function scaledWidth(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  const reservedPx = Math.round(((rounded * CHECKBOX_COLUMN_PX) / 100) * 100) / 100;
  return `calc(${rounded}% - ${reservedPx}px)`;
}

// checkbox + (Date in week mode) + the visible columns - the pencil/trash
// actions live inside the Status cell.
export function buildColumnWidths(mode: "day" | "week", columns: readonly ApprovalsColumnKey[]): string[] {
  const defs = columns
    .map((key) => APPROVALS_COLUMNS.find((c) => c.key === key))
    .filter((c): c is ApprovalsColumnDef => !!c);
  const weights = defs.map((c) => (mode === "week" ? c.weekWeight : c.dayWeight));
  const dateWeight = mode === "week" ? DATE_WEEK_WEIGHT : 0;
  const total = weights.reduce((a, b) => a + b, 0) + dateWeight;
  const pct = (w: number) => (total > 0 ? (w * 100) / total : 0);
  return [
    CHECKBOX_COLUMN_WIDTH,
    ...(mode === "week" ? [scaledWidth(pct(dateWeight))] : []),
    ...weights.map((w) => scaledWidth(pct(w))),
  ];
}

// How many columns a full-width row (the week view's "No entries") spans.
export function approvalsColumnCount(mode: "day" | "week", columns: readonly ApprovalsColumnKey[]): number {
  return 1 + (mode === "week" ? 1 : 0) + columns.length;
}
