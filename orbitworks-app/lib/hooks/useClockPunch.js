import { useCallback, useState } from "react";
import { checkPin, isOnline, newRequestId, sendPunch, uploadClockPhoto } from "../employeeClockApi";
import { clockErrorMessage, errorStep, lockSecondsLeft, NO_SIGNAL, stepAfterPinOk } from "../employeeHome";
import { outcomeOf, startPunchTimer } from "../punchTimings";

// Employee App clock in / out flow:
//   PIN -> server checks the PIN -> live photo -> upload + punch -> confirmation.
//   step: "pin" | "checking" | "camera" | "sending" | "done" | "retry" | "failed"
// The server checks the PIN BEFORE the camera opens, so a wrong PIN or the
// lock shows right away with no photo taken. The punch itself still sends
// the PIN and the server checks it again - the early check can't be used to
// skip it. One requestId for the whole attempt: a retry after a lost reply
// can't double-punch (the server returns the first result). If the punch
// itself comes back "wrong PIN" (rare - e.g. the PIN was changed in
// between), the photo is kept and uploaded again after the new PIN passes,
// since the server deletes a rejected punch's photo.
export function useClockPunch({ action, companyId, employeeId }) {
  const [requestId] = useState(() => newRequestId());
  const [step, setStep] = useState("pin");
  const [pin, setPin] = useState("");
  const [photoUri, setPhotoUri] = useState(null);
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [result, setResult] = useState(null);
  // What "Try again" repeats: the PIN check or the punch.
  const [retryWhat, setRetryWhat] = useState("punch");
  // Dev-build-only step timings (lib/punchTimings.js). Starts when the
  // screen opens (the Clock in / Clock out tap).
  const [timer] = useState(() => startPunchTimer(action));

  const fail = useCallback(async (err, what) => {
    timer.finish(outcomeOf(err));
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
      setRetryWhat(what);
      setStep("retry");
    }
  }, [timer]);

  const submit = useCallback(
    async (pinValue, uri) => {
      setError("");
      setStep("sending");
      if (!(await isOnline())) {
        setError(NO_SIGNAL);
        setRetryWhat("punch");
        setStep("retry");
        return;
      }
      try {
        const photoPath = await uploadClockPhoto({ companyId, employeeId, requestId, localUri: uri });
        timer.mark("uploaded");
        const res = await sendPunch({ action, requestId, pin: pinValue, photoPath });
        timer.mark("punched");
        timer.finish("ok");
        setResult(res);
        setStep("done");
      } catch (err) {
        await fail(err, "punch");
      }
    },
    [action, companyId, employeeId, requestId, fail, timer]
  );

  const verify = useCallback(
    async (pinValue, keptUri) => {
      setError("");
      setStep("checking");
      if (!(await isOnline())) {
        setError(NO_SIGNAL);
        setRetryWhat("check");
        setStep("retry");
        return;
      }
      try {
        await checkPin({ action, requestId, pin: pinValue });
        timer.mark("pinChecked");
        setLockedUntil(0);
        if (stepAfterPinOk(!!keptUri) === "sending") submit(pinValue, keptUri);
        else setStep("camera");
      } catch (err) {
        await fail(err, "check");
      }
    },
    [action, requestId, submit, fail, timer]
  );

  const pressDigit = useCallback(
    (digit) => {
      if (step !== "pin") return;
      const next = (pin + digit).slice(0, 4);
      setPin(next);
      if (next.length < 4) return;
      timer.mark("pinTyped");
      verify(next, photoUri);
    },
    [pin, photoUri, step, verify, timer]
  );

  const deleteDigit = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  const submitPhoto = useCallback(
    (uri) => {
      timer.mark("photoTaken");
      timer.notePhoto(uri);
      setPhotoUri(uri);
      submit(pin, uri);
    },
    [pin, submit, timer]
  );

  const retry = useCallback(
    () => (retryWhat === "check" ? verify(pin, photoUri) : submit(pin, photoUri)),
    [retryWhat, pin, photoUri, verify, submit]
  );

  return { step, pin, photoUri, error, lockedUntil, result, pressDigit, deleteDigit, submitPhoto, retry };
}
