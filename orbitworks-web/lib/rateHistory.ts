import type { RateHistoryEntry } from "@/lib/types";

// Any rate in effect before rateHistory existed is unknowable - this
// sentinel makes the seed entry (the rate right before the first tracked
// change) apply to every date before it, which is the best available
// approximation and matches "past costs must not change" going forward.
// Shared by the employee custom-rate edit flow (useEmployeeModal.ts) and
// the job title rate edit flow (useJobs.ts).
const RATE_HISTORY_EPOCH = "1970-01-01";

export function appendRateHistory(
  history: RateHistoryEntry[] | undefined,
  previousRate: number,
  newRate: number,
  effectiveFrom: string
): RateHistoryEntry[] {
  const seeded = history && history.length > 0
    ? history
    : [{ rate: previousRate, effectiveFrom: RATE_HISTORY_EPOCH }];
  return [...seeded, { rate: newRate, effectiveFrom }];
}
