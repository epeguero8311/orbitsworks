"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { Orbit, MapPin, Check } from "lucide-react";
import { functions } from "@/lib/firebase";

type Step =
  | "loading"
  | "invalid"
  | "idle"
  | "cameraPermission"
  | "pin"
  | "camera"
  | "submitting"
  | "done"
  | "error";

interface LinkInfo {
  valid: boolean;
  companyName?: string;
  siteName?: string;
  expiresAt?: number;
}

interface RedeemResult {
  employeeName: string;
  type: "in" | "out";
  siteName: string;
}

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function TempClockLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const getInfoFn = httpsCallable(functions, "getTempClockLinkInfo");
        const res = await getInfoFn({ token });
        const data = res.data as LinkInfo;
        setInfo(data);
        setStep(data.valid ? "idle" : "invalid");
      } catch (err) {
        console.error("Failed to load temp clock-in link:", err);
        setInfo({ valid: false });
        setStep("invalid");
      }
    })();
  }, [token]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stopCamera, []);

  // Gate: the PIN pad is only reachable once camera access is granted, so
  // nobody can get all the way through PIN entry and then discover the
  // photo step is a dead end. This request's own stream is stopped right
  // away - we only need the permission grant here, not a live feed - and
  // startCamera() below re-acquires it silently at the actual capture step
  // since the browser remembers a granted permission per origin.
  async function requestCameraPermission() {
    setErrorMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      setStep("pin");
    } catch (err) {
      console.error("Camera permission request failed:", err);
      setErrorMessage(
        "Camera access is required to clock in. If you tapped \"Don't allow\" by mistake, use the button below to try again - or check your browser's site settings."
      );
    }
  }

  async function startCamera() {
    setErrorMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setStep("camera");
    } catch (err) {
      console.error("Camera access failed:", err);
      setErrorMessage("Camera access is needed to clock in. Check your browser's site permissions.");
    }
  }

  // Wires the already-granted stream up to the <video> element once it's
  // actually in the DOM. A setTimeout fired from inside startCamera isn't
  // reliable for this - it can run before React has committed the
  // "camera" step's render, especially on mobile browsers, leaving the
  // preview black even though the stream itself is live. An effect keyed
  // on `step` is guaranteed to run after the DOM update instead.
  useEffect(() => {
    if (step !== "camera" || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch((err) => console.error("Video preview play failed:", err));
  }, [step]);

  function handlePinKey(key: string) {
    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      startCamera();
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the preview so the captured photo isn't flipped relative to
    // what the person just saw of themselves in the front-camera view.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    setPhotoDataUrl(dataUrl);
    stopCamera();
    submit(dataUrl);
  }

  async function submit(photo: string) {
    setStep("submitting");
    setErrorMessage("");
    try {
      const redeemFn = httpsCallable(functions, "redeemTempClockLink");
      const res = await redeemFn({ token, pin, photo });
      setResult(res.data as RedeemResult);
      setStep("done");
    } catch (err) {
      console.error("Clock-in submission failed:", err);
      setErrorMessage((err as { message?: string })?.message ?? "Something went wrong. Try again.");
      setStep("error");
    }
  }

  function reset() {
    setPin("");
    setPhotoDataUrl(null);
    setResult(null);
    setErrorMessage("");
    setStep("idle");
  }

  function retryPin() {
    setPin("");
    setPhotoDataUrl(null);
    setErrorMessage("");
    setStep("pin");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="flex items-center gap-2">
        <Orbit className="h-5 w-5 text-accent" />
        <span className="text-lg font-semibold text-gray-950">Orbitsworks</span>
      </div>

      {step === "loading" && <p className="mt-8 text-sm text-gray-600">Loading...</p>}

      {step === "invalid" && (
        <div className="mt-8 max-w-sm text-center">
          <p className="text-base font-medium text-gray-950">This link isn&apos;t active.</p>
          <p className="mt-2 text-sm text-gray-600">
            It may have expired or been revoked. Ask your admin for a new one.
          </p>
        </div>
      )}

      {step === "idle" && info?.valid && (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-600">{info.companyName}</p>
          <div className="mt-3 flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <MapPin className="h-3.5 w-3.5" />
            {info.siteName}
          </div>
          <button
            onClick={() => {
              setStep("cameraPermission");
              requestCameraPermission();
            }}
            className="mt-8 w-full rounded-lg bg-accent px-5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Clock In
          </button>
        </div>
      )}

      {step === "cameraPermission" && (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
          {errorMessage ? (
            <>
              <p className="text-sm text-red-600">{errorMessage}</p>
              <button
                onClick={requestCameraPermission}
                className="mt-6 w-full rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Allow camera access
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-600">Requesting camera access...</p>
          )}
        </div>
      )}

      {step === "pin" && (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center">
          <p className="text-base font-semibold text-gray-950">Enter your PIN</p>
          <div className="mt-5 flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border ${
                  i < pin.length ? "border-accent bg-accent" : "border-gray-300"
                }`}
              />
            ))}
          </div>
          <div className="mt-8 grid w-64 grid-cols-3 gap-2">
            {PIN_KEYS.map((key, i) => (
              <button
                key={i}
                onClick={() => handlePinKey(key)}
                disabled={key === ""}
                className={`flex h-16 items-center justify-center rounded-lg text-xl font-medium text-gray-950 ${
                  key === "" ? "opacity-0" : "hover:bg-gray-100"
                }`}
              >
                {key === "del" ? "⌫" : key}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "camera" && (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center">
          <p className="mb-3 text-sm text-gray-600">Take a quick photo to confirm</p>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full -scale-x-100 object-cover"
            />
          </div>
          <button
            onClick={capturePhoto}
            className="mt-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-accent"
            aria-label="Capture photo"
          >
            <div className="h-12 w-12 rounded-full bg-accent" />
          </button>
        </div>
      )}

      {step === "submitting" && (
        <div className="mt-8 flex flex-col items-center">
          {photoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoDataUrl} alt="" className="h-24 w-24 rounded-full object-cover opacity-60" />
          )}
          <p className="mt-4 text-sm text-gray-600">Submitting...</p>
        </div>
      )}

      {step === "done" && result && (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <Check className="h-6 w-6 text-accent" />
          </div>
          <p className="mt-4 text-lg font-semibold text-gray-950">
            {result.employeeName}, you&apos;re clocked {result.type}.
          </p>
          <p className="mt-1 text-sm text-gray-600">{result.siteName}</p>
          <button
            onClick={reset}
            className="mt-8 w-full rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Done - hand to next person
          </button>
        </div>
      )}

      {step === "error" && (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center text-center">
          <p className="text-sm text-red-600">{errorMessage}</p>
          <button
            onClick={retryPin}
            className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Try again
          </button>
        </div>
      )}

      {(step === "pin" || step === "camera") && errorMessage && (
        <p className="mt-4 max-w-sm text-center text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
