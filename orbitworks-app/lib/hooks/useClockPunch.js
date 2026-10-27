import { useCallback, useState } from "react";
import { isOnline, newRequestId, sendPunch, uploadClockPhoto } from "../employeeClockApi";
import { clockErrorMessage, errorStep, lockSecondsLeft, NO_SIGNAL } from "../employeeHome";

// Employee App clock in / out flow: PIN -> live photo -> send -> confirmation.
//   step: "pin" | "camera" | "sending" | "done" | "retry" | "failed"
// One requestId for the whole attempt: a retry after a lost reply can't
// double-punch (the server returns the first result). A wrong PIN goes back
// to the PIN pad and keeps the photo (it's uploaded again with the new PIN,
// since the server deletes a rejected punch's photo).
export function useClockPunch({ action, companyId, employeeId }) {
  const [requestId] = useState(() => newRequestId());
  const [step, setStep] = useState("pin");
  const [pin, setPin] = useState("");
  const [photoUri, setPhotoUri] = useState(null);
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [result, setResult] = useState(null);

  const submit = useCallback(
    async (pinValue, uri) => {
      setError("");
      setStep("sending");
      if (!(await isOnline())) {
        setError(NO_SIGNAL);
        setStep("retry");
        return;
      }
      try {
        const photoPath = await uploadClockPhoto({ companyId, employeeId, requestId, localUri: uri });
        const res = await sendPunch({ action, requestId, pin: pinValue, photoPath });
        setResult(res);
        setStep("done");
      } catch (err) {
        setError(clockErrorMessage(err, await isOnline()));
        const next = errorStep(err);
        if (next === "pin") {
          setPin("");
          const seconds = lockSecondsLeft(err);
          setLockedUntil(seconds > 0 ? Date.now() + seconds * 1000 : 0);
          setStep("pin");
        } else if (next === "camera") {
          setPhotoUri(null);
          setStep("camera");
        } else if (next === "close") {
          setStep("failed");
        } else {
          setStep("retry");
        }
      }
    },
    [action, companyId, employeeId, requestId]
  );

  const pressDigit = useCallback(
    (digit) => {
      if (step !== "pin") return;
      const next = (pin + digit).slice(0, 4);
      setPin(next);
      if (next.length < 4) return;
      setError("");
      if (photoUri) submit(next, photoUri);
      else setStep("camera");
    },
    [pin, photoUri, step, submit]
  );

  const deleteDigit = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  const submitPhoto = useCallback(
    (uri) => {
      setPhotoUri(uri);
      submit(pin, uri);
    },
    [pin, submit]
  );

  const retry = useCallback(() => submit(pin, photoUri), [pin, photoUri, submit]);

  return { step, pin, photoUri, error, lockedUntil, result, pressDigit, deleteDigit, submitPhoto, retry };
}
