import type { RoundingIncrement } from "@/lib/types";
import {
  computeDailyPaidMinutes,
  computeTotalPaidMinutes,
  minutesToHoursDecimal,
} from "@/lib/utils/rounding";

// Hand-worked test scenarios for the payroll rounding pipeline. No Firebase
// imports, no React - run selfCheckRoundingScenarios() from a one-off script
// or a unit test runner to confirm the pipeline still matches every row.
export type RoundingScenario = {
  id: number;
  description: string;
  // One entry per calendar day for this employee/period.
  dailyClockedMinutes: number[];
  // Same length as dailyClockedMinutes; omitted days default to 0 break.
  dailyBreakMinutes?: number[];
  roundDailyMinutes: RoundingIncrement;
  roundTotalMinutes: RoundingIncrement;
  expectedDailyPaidMinutes: number[];
  expectedTotalPaidMinutes: number;
  expectedTotalHoursDecimal: string;
};

export const ROUNDING_SCENARIOS: RoundingScenario[] = [
  // Week A days (min): 438, 468, 444, 426, 474 (unrounded 2250 = 37.50 h)
  {
    id: 1,
    description: "Week A, daily Off, total Off",
    dailyClockedMinutes: [438, 468, 444, 426, 474],
    roundDailyMinutes: 0,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [438, 468, 444, 426, 474],
    expectedTotalPaidMinutes: 2250,
    expectedTotalHoursDecimal: "37.50",
  },
  {
    id: 2,
    description: "Week A, daily 30, total Off",
    dailyClockedMinutes: [438, 468, 444, 426, 474],
    roundDailyMinutes: 30,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [450, 480, 450, 450, 480],
    expectedTotalPaidMinutes: 2310,
    expectedTotalHoursDecimal: "38.50",
  },
  {
    id: 3,
    description: "Week A, daily 15, total Off",
    dailyClockedMinutes: [438, 468, 444, 426, 474],
    roundDailyMinutes: 15,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [450, 480, 450, 435, 480],
    expectedTotalPaidMinutes: 2295,
    expectedTotalHoursDecimal: "38.25",
  },
  {
    id: 4,
    description: "Week A, daily 5, total Off",
    dailyClockedMinutes: [438, 468, 444, 426, 474],
    roundDailyMinutes: 5,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [440, 470, 445, 430, 475],
    expectedTotalPaidMinutes: 2260,
    expectedTotalHoursDecimal: "37.67",
  },
  {
    id: 5,
    description: "Week A, daily Off, total 30 (lands exactly on the mark)",
    dailyClockedMinutes: [438, 468, 444, 426, 474],
    roundDailyMinutes: 0,
    roundTotalMinutes: 30,
    expectedDailyPaidMinutes: [438, 468, 444, 426, 474],
    expectedTotalPaidMinutes: 2250,
    expectedTotalHoursDecimal: "37.50",
  },
  {
    id: 6,
    description: "Week A, daily 30, total 30",
    dailyClockedMinutes: [438, 468, 444, 426, 474],
    roundDailyMinutes: 30,
    roundTotalMinutes: 30,
    expectedDailyPaidMinutes: [450, 480, 450, 450, 480],
    expectedTotalPaidMinutes: 2310,
    expectedTotalHoursDecimal: "38.50",
  },

  // Week B days (min): 432, 432, 432, 432, 438 (unrounded 2166 = 36.10 h)
  {
    id: 7,
    description: "Week B, daily Off, total 30",
    dailyClockedMinutes: [432, 432, 432, 432, 438],
    roundDailyMinutes: 0,
    roundTotalMinutes: 30,
    expectedDailyPaidMinutes: [432, 432, 432, 432, 438],
    expectedTotalPaidMinutes: 2190,
    expectedTotalHoursDecimal: "36.50",
  },
  {
    id: 8,
    description: "Week B, daily Off, total 15",
    dailyClockedMinutes: [432, 432, 432, 432, 438],
    roundDailyMinutes: 0,
    roundTotalMinutes: 15,
    expectedDailyPaidMinutes: [432, 432, 432, 432, 438],
    expectedTotalPaidMinutes: 2175,
    expectedTotalHoursDecimal: "36.25",
  },
  {
    id: 9,
    description: "Week B, daily Off, total 5",
    dailyClockedMinutes: [432, 432, 432, 432, 438],
    roundDailyMinutes: 0,
    roundTotalMinutes: 5,
    expectedDailyPaidMinutes: [432, 432, 432, 432, 438],
    expectedTotalPaidMinutes: 2170,
    expectedTotalHoursDecimal: "36.17",
  },
  {
    id: 10,
    description: "Week B, daily 30, total Off",
    dailyClockedMinutes: [432, 432, 432, 432, 438],
    roundDailyMinutes: 30,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [450, 450, 450, 450, 450],
    expectedTotalPaidMinutes: 2250,
    expectedTotalHoursDecimal: "37.50",
  },
  {
    id: 11,
    description: "Week B, daily 5, total 30",
    dailyClockedMinutes: [432, 432, 432, 432, 438],
    roundDailyMinutes: 5,
    roundTotalMinutes: 30,
    expectedDailyPaidMinutes: [435, 435, 435, 435, 440],
    expectedTotalPaidMinutes: 2190,
    expectedTotalHoursDecimal: "36.50",
  },

  // Edge cases
  {
    id: 12,
    description: "7h00m20s (420 min after rounding to the nearest minute) -> daily 30 stays 420, NOT 450",
    dailyClockedMinutes: [420],
    roundDailyMinutes: 30,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [420],
    expectedTotalPaidMinutes: 420,
    expectedTotalHoursDecimal: "7.00",
  },
  {
    id: 13,
    description: "7h00m40s (421 min) -> daily 30 -> 450 (7.50)",
    dailyClockedMinutes: [421],
    roundDailyMinutes: 30,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [450],
    expectedTotalPaidMinutes: 450,
    expectedTotalHoursDecimal: "7.50",
  },
  {
    id: 14,
    description:
      "2 sessions same day, 3h10m + 4h05m = 435 min summed first -> daily 30 -> 450 (round once per day, never per session)",
    dailyClockedMinutes: [190 + 245],
    roundDailyMinutes: 30,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [450],
    expectedTotalPaidMinutes: 450,
    expectedTotalHoursDecimal: "7.50",
  },
  {
    id: 15,
    description: "0 completed sessions -> 0.00",
    dailyClockedMinutes: [0],
    roundDailyMinutes: 0,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [0],
    expectedTotalPaidMinutes: 0,
    expectedTotalHoursDecimal: "0.00",
  },
  {
    id: 16,
    description:
      "22:00 Mon -> 02:00 Tue counts entirely on Mon (240 min) - day bucketing itself lives in reportComputations.ts, this only checks the minutes math",
    dailyClockedMinutes: [240],
    roundDailyMinutes: 0,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [240],
    expectedTotalPaidMinutes: 240,
    expectedTotalHoursDecimal: "4.00",
  },

  // Break scenarios
  {
    id: 17,
    description: "clocked 485, break 30, daily 30 -> worked 455 -> 480 (8.00)",
    dailyClockedMinutes: [485],
    dailyBreakMinutes: [30],
    roundDailyMinutes: 30,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [480],
    expectedTotalPaidMinutes: 480,
    expectedTotalHoursDecimal: "8.00",
  },
  {
    id: 18,
    description:
      "clocked 485, break 20, daily 30 -> worked 465 -> 480 (8.00). Break must come off before rounding - rounding first would give 510-20=490",
    dailyClockedMinutes: [485],
    dailyBreakMinutes: [20],
    roundDailyMinutes: 30,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [480],
    expectedTotalPaidMinutes: 480,
    expectedTotalHoursDecimal: "8.00",
  },
  {
    id: 19,
    description: "clocked 20, break 30 -> worked 0, never negative",
    dailyClockedMinutes: [20],
    dailyBreakMinutes: [30],
    roundDailyMinutes: 0,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [0],
    expectedTotalPaidMinutes: 0,
    expectedTotalHoursDecimal: "0.00",
  },
  {
    id: 20,
    description:
      "clocked 480, break 30, rounding Off -> worked 450 ONCE (420 would mean the break got double-deducted)",
    dailyClockedMinutes: [480],
    dailyBreakMinutes: [30],
    roundDailyMinutes: 0,
    roundTotalMinutes: 0,
    expectedDailyPaidMinutes: [450],
    expectedTotalPaidMinutes: 450,
    expectedTotalHoursDecimal: "7.50",
  },

  // Pay check - rate $20, Week B, daily Off, total 30:
  //   daily pay sums to 36.10 x 20 = $722.00
  //   top total pay = 36.50 x 20 = $730.00 (expected difference)
  {
    id: 21,
    description: "Week B, daily Off, total 30, pay check at $20/hr",
    dailyClockedMinutes: [432, 432, 432, 432, 438],
    roundDailyMinutes: 0,
    roundTotalMinutes: 30,
    expectedDailyPaidMinutes: [432, 432, 432, 432, 438],
    expectedTotalPaidMinutes: 2190,
    expectedTotalHoursDecimal: "36.50",
  },
];

export const SCENARIO_21_HOURLY_RATE = 20;
export const SCENARIO_21_EXPECTED_DAILY_PAY_SUM = 722.0;
export const SCENARIO_21_EXPECTED_TOTAL_PAY = 730.0;

export type ScenarioFailure = {
  id: number;
  description: string;
  field: string;
  expected: unknown;
  actual: unknown;
};

export function selfCheckRoundingScenarios(): {
  passed: boolean;
  failures: ScenarioFailure[];
} {
  const failures: ScenarioFailure[] = [];

  for (const s of ROUNDING_SCENARIOS) {
    const breaks = s.dailyBreakMinutes ?? s.dailyClockedMinutes.map(() => 0);
    const dailyPaidMinutes = s.dailyClockedMinutes.map((clocked, i) =>
      computeDailyPaidMinutes(clocked, breaks[i] ?? 0, s.roundDailyMinutes)
    );
    const totalPaidMinutes = computeTotalPaidMinutes(dailyPaidMinutes, s.roundTotalMinutes);
    const totalHoursDecimal = minutesToHoursDecimal(totalPaidMinutes);

    if (JSON.stringify(dailyPaidMinutes) !== JSON.stringify(s.expectedDailyPaidMinutes)) {
      failures.push({
        id: s.id,
        description: s.description,
        field: "expectedDailyPaidMinutes",
        expected: s.expectedDailyPaidMinutes,
        actual: dailyPaidMinutes,
      });
    }
    if (totalPaidMinutes !== s.expectedTotalPaidMinutes) {
      failures.push({
        id: s.id,
        description: s.description,
        field: "expectedTotalPaidMinutes",
        expected: s.expectedTotalPaidMinutes,
        actual: totalPaidMinutes,
      });
    }
    if (totalHoursDecimal !== s.expectedTotalHoursDecimal) {
      failures.push({
        id: s.id,
        description: s.description,
        field: "expectedTotalHoursDecimal",
        expected: s.expectedTotalHoursDecimal,
        actual: totalHoursDecimal,
      });
    }
  }

  // Scenario 21's pay check: daily pay sums the UNROUNDED daily worked
  // minutes per day (daily rounding is Off here) at the hourly rate, while
  // the top total pay uses the rounded total - they are allowed to differ.
  const scenario21 = ROUNDING_SCENARIOS.find((s) => s.id === 21)!;
  const dailyPaySum = scenario21.dailyClockedMinutes.reduce(
    (sum, clocked) => sum + (clocked / 60) * SCENARIO_21_HOURLY_RATE,
    0
  );
  const totalPay =
    (Number(scenario21.expectedTotalHoursDecimal) ) * SCENARIO_21_HOURLY_RATE;

  if (Number(dailyPaySum.toFixed(2)) !== SCENARIO_21_EXPECTED_DAILY_PAY_SUM) {
    failures.push({
      id: 21,
      description: scenario21.description,
      field: "dailyPaySum",
      expected: SCENARIO_21_EXPECTED_DAILY_PAY_SUM,
      actual: Number(dailyPaySum.toFixed(2)),
    });
  }
  if (Number(totalPay.toFixed(2)) !== SCENARIO_21_EXPECTED_TOTAL_PAY) {
    failures.push({
      id: 21,
      description: scenario21.description,
      field: "totalPay",
      expected: SCENARIO_21_EXPECTED_TOTAL_PAY,
      actual: Number(totalPay.toFixed(2)),
    });
  }

  return { passed: failures.length === 0, failures };
}
