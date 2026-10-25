import { useCallback, useRef, useState } from "react";
import { submitJoin } from "../joinApi";
import { mapJoinError } from "../validators/joinSignup";

// Sends the sign-up once. The ref lock blocks a second tap before React
// re-renders the disabled button. Resolves { ok: true, pin, companyName }
// or { ok: false, kind, message } - never throws, never logs the payload.
export function useJoinSubmit() {
  const [sending, setSending] = useState(false);
  const lock = useRef(false);

  const submit = useCallback(async (payload) => {
    if (lock.current) return { ok: false, kind: "busy", message: null };
    lock.current = true;
    setSending(true);
    try {
      const res = await submitJoin(payload);
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, ...mapJoinError(err) };
    } finally {
      lock.current = false;
      setSending(false);
    }
  }, []);

  return { sending, submit };
}
