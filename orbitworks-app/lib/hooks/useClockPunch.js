import { useCallback, useEffect, useRef, useState } from "react";
import { isOnline, newRequestId } from "../employeeClockApi";
import { clockErrorMessage, errorStep, lockSecondsLeft } from "../employeeHome";
import { queuedTimeFor } from "../punchQueueLogic";
import { enqueuePunch } from "../punchQueue";
import { isWeakSignal } from "../punchQueueEvents";
import { punchClockFields } from "../clockAnchor";
import { checkPinOnPhone, pinLockSecondsLeft } from "../pinCheck";
import { outcomeOf, startPunchTimer } from "../punchTimings";
import { startPunchFix } from "../punchLocation";

const SAVE_FAILED = "Couldn't save this punch on the phone. Try again.";

// Employee App clock in / out flow - everything on screen is instant:
//   PIN -> checked on the phone (lib/pinCheck.js) -> camera -> photo ->
//   saved on the phone -> green confirmation at once. The phone's queue
//   (punchQueueSync.js) sends it straight away when online.
//   step: "pin" | "camera" | "done" | "retry" | "failed"
//   result set = the green overlay shows; the step moves to "done" only
//   once it is opaque (overlayShown).
// PIN check (decided 2026-11-02, A1 / L1):
//   - right PIN: the camera opens; the server checks the PIN again when
//     the punch arrives
//   - wrong PIN or locked: the error shows on the PIN screen at once
//     (3 wrong = 1-minute lock, saved on the phone), nothing is saved
//   - no check value on the phone (rare): the camera opens and the server
//     checks the PIN when the punch syncs, as offline did before
// The PIN is saved with the punch (SecureStore, until it syncs) so the
// server can check it. "Will sync when online" shows only when offline, on
// weak signal, or when the PIN couldn't be checked. One requestId for the
// whole attempt: a resend can't double-punch.
// (Phase 5: no Redo mode - a punch whose PIN changed before it synced is
// accepted by the server with the PIN that was right at the time.)
export function useClockPunch({ action, companyId, employeeId, expectedSite, lastEventMs }) {
  const [requestId] = useState(() => newRequestId());
  const [step, setStep] = useState("pin");
  const [pin, setPin] = useState("");
  const [photoUri, setPhotoUri] = useState(null);
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [result, setResult] = useState(null);
  // What "Try again" repeats: "punch" = saving the punch again.
  const [retryWhat, setRetryWhat] = useState("punch");
  // Dev-build-only step timings (lib/punchTimings.js). Starts when the
  // screen opens (the Clock in / Clock out tap).
  const [timer] = useState(() => startPunchTimer(action));
  // Phase 6: the location lookup starts as the PIN screen opens (no prompt);
  // the save takes whatever is ready, never waits (lib/punchLocation.js).
  const [fix] = useState(() => startPunchFix());
  // true = the phone checked this PIN; false = the server checks it at sync.
  const pinCheckedRef = useRef(false);
  // A PIN check is running (blocks extra taps on the pad).
  const checkingRef = useRef(false);

  // A lock saved from before (an app restart included) shows on open.
  useEffect(() => {
    let active = true;
    pinLockSecondsLeft(companyId, employeeId).then((seconds) => {
      if (active && seconds > 0) setLockedUntil(Date.now() + seconds * 1000);
    });
    return () => {
      active = false;
    };
  }, [companyId, employeeId]);

  const fail = useCallback(
    async (err, what) => {
      timer.finish(outcomeOf(err));
      // A phone-side PIN error has its own message (never "No signal").
      setError(err && err.local ? err.message : clockErrorMessage(err, await isOnline()));
      setPhotoUri(null);
      const next = errorStep(err);
      if (next === "pin") {
        setPin("");
        const seconds = lockSecondsLeft(err);
        setLockedUntil(seconds > 0 ? Date.now() + seconds * 1000 : 0);
        setStep("pin");
      } else if (next === "close") {
        setStep("failed");
      } else if (next === "camera") {
        setStep("camera");
      } else {
        setRetryWhat(what);
        setStep("retry");
      }
    },
    [timer]
  );

  // Saves the punch on the phone and shows the confirmation.
  const save = useCallback(
    async (pinValue, uri) => {
      const checked = pinCheckedRef.current;
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
            location: fix.take(queuedAtMs),
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
    [companyId, employeeId, action, requestId, expectedSite, lastEventMs, timer, fix]
  );

  // Photo taken: save it (the PIN was already checked before the camera).
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
      await save(pin, uri);
      // Saved: the overlay is up. Not saved: "Try again" saves again.
      submittingRef.current = false;
    },
    [pin, save, timer]
  );

  // The 4th digit: check the PIN on the phone, then the camera, or the
  // error on the PIN screen.
  const checkTyped = useCallback(
    async (pinValue) => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      setError("");
      const r = await checkPinOnPhone({ companyId, employeeId, pin: pinValue });
      checkingRef.current = false;
      if (r.state === "failed") {
        await fail(r.err, "check");
        return;
      }
      timer.mark("pinChecked");
      pinCheckedRef.current = r.state === "ok";
      setLockedUntil(0);
      timer.mark("cameraOpen");
      setStep("camera");
    },
    [companyId, employeeId, fail, timer]
  );

  const pressDigit = useCallback(
    (digit) => {
      if (step !== "pin" || checkingRef.current) return;
      const next = (pin + digit).slice(0, 4);
      setPin(next);
      if (next.length < 4) return;
      timer.mark("pinTyped");
      checkTyped(next);
    },
    [pin, step, checkTyped, timer]
  );

  const deleteDigit = useCallback(() => {
    if (!checkingRef.current) setPin((p) => p.slice(0, -1));
  }, []);

  const retry = useCallback(() => {
    if (retryWhat === "punch" && photoUri) {
      save(pin, photoUri);
      return;
    }
    setError("");
    setPin("");
    setStep("pin");
  }, [retryWhat, pin, photoUri, save]);

  // The green overlay fully covers the screen: only now does the screen
  // under it change (camera released), so nothing shows through the fade.
  const overlayShown = useCallback(() => setStep("done"), []);

  return { step, pin, photoUri, error, lockedUntil, result, pressDigit, deleteDigit, submitPhoto, retry, overlayShown };
}
