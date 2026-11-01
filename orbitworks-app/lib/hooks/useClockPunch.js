import { useCallback, useEffect, useRef, useState } from "react";
import { checkPin, isOnline, newRequestId, PIN_CHECK_TIMEOUT_MS, withTimeout } from "../employeeClockApi";
import { clockErrorMessage, errorStep, lockSecondsLeft, NO_SIGNAL } from "../employeeHome";
import { isSignalError, queuedTimeFor } from "../punchQueueLogic";
import { enqueuePunch, getPunch, redoPunch } from "../punchQueue";
import { isWeakSignal, noteSignalOk, noteWeakSignal } from "../punchQueueEvents";
import { syncPunchQueue } from "../punchQueueSync";
import { punchClockFields } from "../clockAnchor";
import { outcomeOf, startPunchTimer } from "../punchTimings";

const SAVE_FAILED = "Couldn't save this punch on the phone. Try again.";

// Employee App clock in / out flow - as fast as the supervisor app:
//   PIN -> camera opens right away (the server checks the PIN meanwhile)
//   -> photo -> saved on the phone -> green confirmation at once. The phone's
//   queue (punchQueueSync.js) sends it straight away when online.
//   step: "pin" | "camera" | "checking" | "done" | "retry" | "failed"
//   (+ "sending" for Redo). result set = the green overlay shows; the step
//   moves to "done" only once it is opaque (overlayShown).
// PIN check, in the background:
//   - right PIN: the punch is saved; the server checks the PIN again when
//     the punch arrives (the early check can't be used to skip it)
//   - wrong PIN, lock, inactive: the camera closes and the error shows on
//     the PIN screen, nothing is saved
//   - no signal, or no answer within 3 s: the PIN is saved with the punch
//     (SecureStore) and the server checks it when it syncs (Phase 4)
//   - the photo taken before the answer: "Checking PIN..." until it comes,
//     3 s after the PIN at most
// "Will sync when online" shows only when offline, on weak signal, or when
// the PIN couldn't be checked. One requestId for the whole attempt: a
// resend can't double-punch (the server returns the first result).
//
// Redo mode (redoId): a saved punch failed at sync with a wrong PIN. The
// PIN is checked online (normal 3-strike lock), then the same punch - same
// time, same photo - is sent again from the queue. No camera.
export function useClockPunch({ action, companyId, employeeId, expectedSite, lastEventMs, redoId }) {
  const [requestId] = useState(() => redoId || newRequestId());
  const [step, setStep] = useState("pin");
  const [pin, setPin] = useState("");
  const [photoUri, setPhotoUri] = useState(null);
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [result, setResult] = useState(null);
  // What "Try again" repeats: the PIN check or saving the punch.
  const [retryWhat, setRetryWhat] = useState("punch");
  // Dev-build-only step timings (lib/punchTimings.js). Starts when the
  // screen opens (the Clock in / Clock out tap).
  const [timer] = useState(() => startPunchTimer(action));
  // The running PIN check: { attempt, run: Promise<{ state, err? }> }.
  // state: "ok" | "unchecked" (no answer - the server checks at sync) | "failed".
  const checkRef = useRef(null);
  const attemptRef = useRef(0);
  // Where the screen is, for the background check to act on.
  const stepRef = useRef("pin");
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const fail = useCallback(
    async (err, what) => {
      timer.finish(outcomeOf(err));
      setError(clockErrorMessage(err, await isOnline()));
      setPhotoUri(null);
      const next = errorStep(err);
      if (next === "pin") {
        setPin("");
        const seconds = lockSecondsLeft(err);
        setLockedUntil(seconds > 0 ? Date.now() + seconds * 1000 : 0);
        setStep("pin");
      } else if (next === "close" || (next === "camera" && redoId)) {
        setStep("failed");
      } else if (next === "camera") {
        setStep("camera");
      } else {
        setRetryWhat(what);
        setStep("retry");
      }
    },
    [timer, redoId]
  );

  // Starts the PIN check behind the camera.
  const startCheck = useCallback(
    (pinValue) => {
      const attempt = ++attemptRef.current;
      const run = (async () => {
        if (!(await isOnline())) return { state: "unchecked" };
        try {
          await withTimeout(checkPin({ action, requestId, pin: pinValue }), PIN_CHECK_TIMEOUT_MS);
          timer.mark("pinChecked");
          noteSignalOk();
          return { state: "ok" };
        } catch (err) {
          if (isSignalError(err)) {
            if (err.code === "timeout") noteWeakSignal();
            return { state: "unchecked" };
          }
          return { state: "failed", err };
        }
      })();
      const check = { attempt, run, result: null };
      checkRef.current = check;
      run.then((r) => {
        if (attemptRef.current !== attempt) return;
        check.result = r;
        if (r.state === "ok") setLockedUntil(0);
        // Still framing the photo: close the camera with the error now.
        if (r.state === "failed" && stepRef.current === "camera") fail(r.err, "check");
      });
    },
    [action, requestId, timer, fail]
  );

  // Saves the punch on the phone and shows the confirmation.
  const save = useCallback(
    async (pinValue, uri, checked) => {
      try {
        const queuedAtMs = queuedTimeFor(Date.now(), lastEventMs);
        const clock = await punchClockFields();
        const [, online] = await Promise.all([
          enqueuePunch({
            companyId,
            employeeId,
            action,
            requestId,
            queuedAtMs,
            siteName: expectedSite || "",
            pin: pinValue,
            photoUri: uri,
            photoUploaded: false,
            clock,
          }),
          isOnline(),
        ]);
        timer.finish(checked ? "saved" : "saved, PIN at sync");
        const showNote = !checked || !online || isWeakSignal();
        // The green overlay shows now; the step under it stays as it is
        // (the photo) until the overlay is opaque - see overlayShown.
        setResult({ type: action, timestampMs: queuedAtMs, siteName: expectedSite || "", queued: showNote });
      } catch {
        setError(SAVE_FAILED);
        setRetryWhat("punch");
        setStep("retry");
      }
    },
    [companyId, employeeId, action, requestId, expectedSite, lastEventMs, timer]
  );

  // Photo taken: wait for the PIN answer if it isn't in yet (3 s cap from
  // the PIN), then save - or back to the PIN on a wrong one.
  const submittingRef = useRef(false);
  const submitPhoto = useCallback(
    async (uri) => {
      // A second "Use photo" tap before the overlay is up does nothing.
      if (submittingRef.current) return;
      submittingRef.current = true;
      timer.mark("photoTaken");
      timer.notePhoto(uri);
      setPhotoUri(uri);
      setError("");
      const check = checkRef.current;
      // The spinner only while the PIN answer is really still out.
      if (check && !check.result) setStep("checking");
      const r = check ? check.result || (await check.run) : { state: "unchecked" };
      if (r.state === "failed") {
        submittingRef.current = false;
        await fail(r.err, "check");
        return;
      }
      await save(pin, uri, r.state === "ok");
      // Saved: the overlay is up. Not saved: "Try again" saves again.
      submittingRef.current = false;
    },
    [pin, save, fail, timer]
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
      } catch {
        setError(SAVE_FAILED);
        setRetryWhat("check");
        setStep("retry");
      }
    },
    [action, companyId, employeeId, requestId]
  );

  // Redo only: the PIN is checked online before anything is resent.
  const verifyRedo = useCallback(
    async (pinValue) => {
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
        noteSignalOk();
        setLockedUntil(0);
        resendSaved(pinValue);
      } catch (err) {
        await fail(err, "check");
      }
    },
    [action, requestId, resendSaved, fail, timer]
  );

  const pressDigit = useCallback(
    (digit) => {
      if (step !== "pin") return;
      const next = (pin + digit).slice(0, 4);
      setPin(next);
      if (next.length < 4) return;
      timer.mark("pinTyped");
      if (redoId) {
        verifyRedo(next);
        return;
      }
      setError("");
      startCheck(next);
      timer.mark("cameraOpen");
      setStep("camera");
    },
    [pin, step, redoId, verifyRedo, startCheck, timer]
  );

  const deleteDigit = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  const retry = useCallback(() => {
    if (redoId) {
      verifyRedo(pin);
      return;
    }
    if (retryWhat === "punch" && photoUri) {
      save(pin, photoUri, false);
      return;
    }
    setError("");
    startCheck(pin);
    setStep("camera");
  }, [redoId, retryWhat, pin, photoUri, verifyRedo, save, startCheck]);

  // The green overlay fully covers the screen: only now does the screen
  // under it change (camera released), so nothing shows through the fade.
  const overlayShown = useCallback(() => setStep("done"), []);

  return { step, pin, photoUri, error, lockedUntil, result, pressDigit, deleteDigit, submitPhoto, retry, overlayShown };
}
