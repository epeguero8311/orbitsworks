import { runSignOut } from "./signOutSteps";
import { clearEmployeePush } from "./employeePush";
import { cancelAllBreakReminders } from "./breakReminderScheduler";
import { forgetPinVerifier } from "./pinCheck";

// Employee App log out: drop this phone's PIN check value (lib/pinCheck.js),
// unhook this phone's push token on the server (Phase 7, so a shared phone
// never gets this employee's pushes) and cancel break reminders - each
// capped at 3 s - then sign out, always.
export function signOutEmployee({ companyId, employeeId, signOutUser }) {
  return runSignOut({
    steps: [
      () => forgetPinVerifier(companyId, employeeId),
      () => clearEmployeePush(),
      () => cancelAllBreakReminders(companyId, employeeId),
    ],
    signOut: signOutUser,
  });
}
