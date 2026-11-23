import { formatBreakDigits, formatTimerDigits } from "../../lib/employeeHome";
import TimerCard from "../ui/TimerCard";
import ProgressBar from "../ui/ProgressBar";

const PILLS = {
  out: { label: "Clocked out", tone: "neutral" },
  done: { label: "Done for the day", tone: "neutral" },
  in: { label: "Clocked in", tone: "green" },
  break: { label: "On break", tone: "orange" },
};

const DEFAULT_MAX_BREAK_MINUTES = 15;

// Employee Home status card. Clocked in: worked time this shift (breaks
// excluded - it pauses on break) plus the start time. On break: count-up
// from break start, with a bar up to the company's max break length.
// Clocked out / done: a gray 00:00:00.
export default function StatusCard({ homeState, nowMs, startedLabel, maxBreakMinutes }) {
  const { status } = homeState;
  const pill = PILLS[status] || PILLS.out;

  if (status === "in") {
    return (
      <TimerCard
        pillLabel={pill.label}
        pillTone={pill.tone}
        time={formatTimerDigits(homeState.workedMs)}
        caption={startedLabel ? `Started at ${startedLabel}` : null}
      />
    );
  }

  if (status === "break" && homeState.breakStartMs) {
    const elapsedMs = Math.max(0, nowMs - homeState.breakStartMs);
    const maxMin = Number(maxBreakMinutes) > 0 ? Number(maxBreakMinutes) : DEFAULT_MAX_BREAK_MINUTES;
    return (
      <TimerCard pillLabel={pill.label} pillTone={pill.tone} time={formatBreakDigits(elapsedMs)}>
        <ProgressBar
          progress={elapsedMs / (maxMin * 60000)}
          startLabel={`${Math.floor(elapsedMs / 60000)} min`}
          endLabel={`${maxMin} min break`}
        />
      </TimerCard>
    );
  }

  return <TimerCard pillLabel={pill.label} pillTone={pill.tone} time="00:00:00" dimmed />;
}
