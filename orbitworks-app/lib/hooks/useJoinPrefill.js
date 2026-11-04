import { useState } from "react";
import { applyPrefill } from "../validators/joinSignup";

// Email invite autofill (Phase 5d). Fills the sign-up form ONCE per link
// from info.prefill (getInviteInfo, looked up by the token on the server -
// never from the link itself). Later reloads (consent / subcontractor
// Retry) don't fill it again, so nothing the person typed is overwritten.
//
// No prefill (crew code, older server, or junk dropped by parseJoinInfo):
// the form stays empty and editable, exactly as before 5d.
//
// Runs during render (React's "adjust state when a prop changes" pattern),
// so the form shows filled on the first frame - no flash of empty boxes and
// no setState inside an effect.
//
// Returns emailLocked: true once the invited email is in the form. The
// screen shows it read-only; acceptEmployeeInvite still checks it.
// And nameFromPrefill: true once the employee's name was filled in from the
// invite. The submit sends it so the server may save an edited name to the
// row (without it - e.g. app builds before 5d - the row's name is kept).
export function useJoinPrefill({ token, kind, info, setForm }) {
  const [applied, setApplied] = useState({ token: null, emailLocked: false, nameFromPrefill: false });

  if (token && info && applied.token !== token) {
    const prefill = kind === "invite" ? info.prefill : null;
    setApplied({ token, emailLocked: !!(prefill && prefill.email), nameFromPrefill: !!(prefill && prefill.fullName) });
    if (prefill) setForm((f) => applyPrefill(f, prefill, info.subcontractors));
  }

  const current = applied.token === token;
  return { emailLocked: current && applied.emailLocked, nameFromPrefill: current && applied.nameFromPrefill };
}
