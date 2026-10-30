import { useCallback, useState } from "react";
import {
  checkPin,
  isOnline,
  newRequestId,
  PIN_CHECK_TIMEOUT_MS,
  PUNCH_TIMEOUT_MS,
  sendPunch,
  uploadClockPhoto,
  withTimeout,
} from "../employeeClockApi";
import { clockErrorMessage, errorStep, lockSecondsLeft, NO_SIGNAL, stepAfterPinOk } from "../employeeHome";
import { isSignalError, queuedTimeFor } from "../punchQueueLogic";
import { enqueuePunch, getPunch, redoPunch, setLastSynced } from "../punchQueue";
import { noteSignalOk, noteWeakSignal } from "../punchQueueEvents";
import { syncPunchQueue } from "../punchQueueSync";
import { outcomeOf, startPunchTimer } from "../punchTimings";

const SAVE_FAILED = "Couldn't save this punch on the phone. Try again.";

// Employee App clock in / out flow:
//   PIN -> server checks the PIN -> live photo -> upload + punch -> confirmation.
//   step: "pin" | "checking" | "camera" | "sending" | "done" | "retry" | "failed"
// The server checks the PIN BEFORE the camera opens, so a wrong PIN or the
// lock shows right away with no photo taken. The punch itself still sends
// the PIN and the server checks it again - the early check can't be used to
// skip it. One requestId for the whole attempt: a resend can't
// double-punch (the server returns the first result). If the punch itself
// comes back "wrong PIN" (rare - e.g. the PIN was changed in between), the
// photo is kept and uploaded again after the new PIN passes, since the
// server deletes a rejected punch's photo.
//
// Phase 4 - saved on the phone instead (confirmation shows right away,
// result.queued = true) when:
//   - there's no signal, or the PIN check takes over 3 s (the PIN is kept
//     for the server to check when it syncs)
//   - upload + punch take over 5 s, or fail for a signal reason
//   - older punches are still in the phone's queue (queueAhead) - a new
//     punch goes behind them so they stay in order
// Only a real failure (wrong PIN, lock, inactive...) shows an error.
//
// Redo mode (redoId): a saved punch failed at sync with a wrong PIN. The
// PIN is checked online (normal 3-strike lock), then the same punch - same
// time, same photo - is sent again from the queue. No camera.
export function useClockPunch({ action, companyId, employeeId, expectedSite, lastEventMs, queueAhead, redoId }) {
  const [requestId] = useState(() => redoId || newRequestId());
  const [step, setStep] = useState("pin");
  const [pin, setPin] = useState("");
  const [photoUri, setPhotoUri] = useState(null);
  const [pinChecked, setPinChecked] = useState(false);
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [result, setResult] = useState(null);
  // What "Try again" repeats: the PIN check or the punch.
  const [retryWhat, setRetryWhat] = useState("punch");
  // Dev-build-only step timings (lib/punchTimings.js). Starts when the
  // screen opens (the Clock in / Clock out tap).
  const [timer] = useState(() => startPunchTimer(action));

  const fail = useCallback(
    async (err, what) => {
      timer.finish(outcomeOf(err));
      setError(clockErrorMessage(err, await isOnline()));
      const next = errorStep(err);
      if (next === "pin") {
        setPin("");
        const seconds = lockSecondsLeft(err);
        setLockedUntil(seconds > 0 ? Date.now() + seconds * 1000 : 0);
        setStep("pin");
      } else if (next === "camera" && !redoId) {
        setPhotoUri(null);
        setStep("camera");
      } else if (next === "close" || next === "camera") {
        setStep("failed");
      } else {
        setRetryWhat(what);
        setStep("retry");
      }
    },
    [timer, redoId]
  );

  // Keeps the punch on the phone and shows the confirmation.
  const save = useCallback(
    async (pinValue, uri, uploaded, queuedAtMs) => {
      try {
        await enqueuePunch({
          companyId,
          employeeId,
          action,
          requestId,
          queuedAtMs,
          siteName: expectedSite || "",
          pin: pinValue,
          photoUri: uri,
          photoUploaded: uploaded,
        });
        timer.finish("queued");
        setResult({ type: action, timestampMs: queuedAtMs, siteName: expectedSite || "", queued: true });
        setStep("done");
      } catch {
        setError(SAVE_FAILED);
        setRetryWhat("punch");
        setStep("retry");
      }
    },
    [companyId, employeeId, action, requestId, expectedSite, timer]
  );

  const submit = useCallback(
    async (pinValue, uri, checked) => {
      setError("");
      setStep("sending");
      const queuedAtMs = queuedTimeFor(Date.now(), lastEventMs);
      if (!checked || queueAhead || !(await isOnline())) {
        await save(pinValue, uri, false, queuedAtMs);
        return;
      }
      let uploaded = false;
      let abandoned = false;
      try {
        const res = await withTimeout(
          (async () => {
            const photoPath = await uploadClockPhoto({ companyId, employeeId, requestId, localUri: uri });
            uploaded = true;
            timer.mark("uploaded");
            if (abandoned) return null;
            return sendPunch({ action, requestId, pin: pinValue, photoPath });
          })(),
          PUNCH_TIMEOUT_MS
        );
        timer.mark("punched");
        timer.finish("ok");
        noteSignalOk();
        setLastSynced(companyId, employeeId, Date.now()).catch(() => {});
        setResult(res);
        setStep("done");
      } catch (err) {
        abandoned = true;
        if (isSignalError(err)) {
          if (err.code === "timeout") noteWeakSignal();
          await save(pinValue, uri, uploaded, queuedAtMs);
          return;
        }
        await fail(err, "punch");
      }
    },
    [action, companyId, employeeId, requestId, lastEventMs, queueAhead, save, fail, timer]
  );

  // Redo: the PIN passed online -> resend the saved punch now.
  const resendSaved = useCallback(
    async (pinValue) => {
      setStep("sending");
      try {
        await redoPunch(requestId, pinValue);
        await syncPunchQueue(companyId, employeeId);
        const item = await getPunch(requestId);
        if (item && item.status === "failed") {
          setError(item.failMessage);
          setStep("failed");
          return;
        }
        const queued = !item || item.status !== "synced";
        setResult({
          type: action,
          timestampMs: item ? item.queuedAtMs : Date.now(),
          siteName: item ? item.siteName : "",
          queued,
        });
        setStep("done");
      } catch {
        setError(SAVE_FAILED);
        setRetryWhat("check");
        setStep("retry");
      }
    },
    [action, companyId, employeeId, requestId]
  );

  const verify = useCallback(
    async (pinValue, keptUri) => {
      setError("");
      setStep("checking");
      const afterPin = (checked) => {
        setPinChecked(checked);
        if (stepAfterPinOk(!!keptUri) === "sending") submit(pinValue, keptUri, checked);
        else setStep("camera");
      };
      const online = await isOnline();
      if (redoId && !online) {
        setError(NO_SIGNAL);
        setRetryWhat("check");
        setStep("retry");
        return;
      }
      if (!online) {
        afterPin(false);
        return;
      }
      try {
        const check = checkPin({ action, requestId, pin: pinValue });
        await (redoId ? check : withTimeout(check, PIN_CHECK_TIMEOUT_MS));
        timer.mark("pinChecked");
        noteSignalOk();
        setLockedUntil(0);
        if (redoId) resendSaved(pinValue);
        else afterPin(true);
      } catch (err) {
        if (!redoId && isSignalError(err)) {
          if (err.code === "timeout") noteWeakSignal();
          afterPin(false);
          return;
        }
        await fail(err, "check");
      }
    },
    [action, requestId, redoId, submit, resendSaved, fail, timer]
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
      submit(pin, uri, pinChecked);
    },
    [pin, pinChecked, submit, timer]
  );

  const retry = useCallback(
    () => (retryWhat === "check" ? verify(pin, photoUri) : submit(pin, photoUri, pinChecked)),
    [retryWhat, pin, photoUri, pinChecked, verify, submit]
  );

  return { step, pin, photoUri, error, lockedUntil, result, pressDigit, deleteDigit, submitPhoto, retry };
}
