import type { JoinCodeListResponse } from "@/lib/types";

// Why a crew code shows "Plan full", and what the admin can do about it.
// null when the plan still has room. Client-safe (no server imports).
export function planFullMessage(seats: Pick<JoinCodeListResponse, "planFull" | "activeCap" | "totalCap">): string | null {
  if (seats.planFull === "active") {
    return `Your plan's ${seats.activeCap} active employee seats are in use. Deactivate an employee or upgrade your plan so new crew can join with this code.`;
  }
  if (seats.planFull === "total") {
    return `Your plan's ${seats.totalCap} employee records are used (inactive employees count too). Permanently delete a former employee or upgrade your plan so new crew can join with this code.`;
  }
  return null;
}
