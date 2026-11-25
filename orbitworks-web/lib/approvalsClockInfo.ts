// Approve Hours Clock-in/out Type + Device columns (Task 2, Pro). Pure, so
// test/approvalsColumns.test.mjs runs it under plain Node.
//
// Type (D3, D10) - the event's original `source` (an admin time edit only
// sets adjustedTimestamp, never source):
//   Admin Manual    adminManual
//   Employee App    employeeApp
//   Supervisor App  pin (camera clock-in), supervisorPin (breaks),
//                   supervisorOverride, faceMatch (legacy)
//   Quick Link      tempLink (Temp Clock-In Link)
//   Kiosk           kiosk (Task 5 K19 - a shared Kiosk iPad)
//   Auto clock-out  autoClockOut (new and legacy sweeps)
//   Deactivated     employeeDeactivated
// Anything else (autoBreakEnd is a break event, never an in/out) = "-".
//
// Device (D4) - only the supervisor app stamps device info today
// (deviceId + deviceNameSnapshot, every plan). The employee app, temp
// links and admin entries send none, and older app builds sent none:
//   Supervisor app   name at punch time, else "Unnamed device"
//                    (no deviceId at all = old build = "-")
//   Employee app     "Employee's phone"
//   Kiosk            the kiosk's device name at punch time, else "Kiosk"
//   everything else  "-"

type ClockInfoEvent = {
  source?: string;
  deviceId?: string | null;
  deviceNameSnapshot?: string | null;
};

export const NO_VALUE = "-";

const SUPERVISOR_APP_SOURCES = new Set(["pin", "supervisorPin", "supervisorOverride", "faceMatch"]);

export function clockTypeLabel(event: ClockInfoEvent | null | undefined): string {
  const source = event?.source;
  if (!source) return NO_VALUE;
  if (SUPERVISOR_APP_SOURCES.has(source)) return "Supervisor App";
  switch (source) {
    case "adminManual":
      return "Admin Manual";
    case "employeeApp":
      return "Employee App";
    case "kiosk":
      return "Kiosk";
    case "tempLink":
      return "Quick Link";
    case "autoClockOut":
      return "Auto clock-out";
    case "employeeDeactivated":
      return "Deactivated";
    default:
      return NO_VALUE;
  }
}

export function clockDeviceLabel(event: ClockInfoEvent | null | undefined): string {
  const source = event?.source;
  if (!source) return NO_VALUE;
  if (source === "employeeApp") return "Employee's phone";
  if (source === "kiosk") {
    const kioskName = typeof event?.deviceNameSnapshot === "string" ? event.deviceNameSnapshot.trim() : "";
    return kioskName || "Kiosk";
  }
  if (!SUPERVISOR_APP_SOURCES.has(source)) return NO_VALUE;
  const name = typeof event?.deviceNameSnapshot === "string" ? event.deviceNameSnapshot.trim() : "";
  if (name) return name;
  return typeof event?.deviceId === "string" && event.deviceId ? "Unnamed device" : NO_VALUE;
}
