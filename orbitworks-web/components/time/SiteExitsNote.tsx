import type { SiteExit } from "@/lib/types";
import { siteExitLine, siteExitTone } from "@/lib/siteExits";

// Employee App Phase 8 - the times an employee left the clock-in site's
// radius during this shift (or the phone could not track them), shown on
// the shift's clock-in next to its comments. Red = left the job site; gray
// = on a break, short (back within 3 min) or tracking off. A flag only -
// it never changes the shift's hours. Renders nothing when there are none.
function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function SiteExitsNote({ exits }: { exits: SiteExit[] }) {
  if (exits.length === 0) return null;

  return (
    <ul className="space-y-1" title="From the employee app while clocked in. Times are from the employee's phone.">
      {exits.map((e) => {
        const red = siteExitTone(e) === "red";
        return (
          <li key={e.id} className={red ? "text-xs font-medium text-red-700" : "text-xs text-gray-500"}>
            <span className={`mr-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${red ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"}`}>
              {e.kind === "left" ? "Left site" : "Tracking off"}
            </span>
            {siteExitLine(e, timeLabel)}
          </li>
        );
      })}
    </ul>
  );
}
