"use client";

// ScanningFlow — dental scanning interface with stability detection and mouth guide overlay.
// Handles camera init, device-motion stability tracking, per-step frame capture, and post-scan notification.
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, CheckCircle2, X, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import MouthGuideOverlay from "./MouthGuideOverlay";
import type { ScanStep, ToastState } from "@/lib/types";

const STEPS: readonly ScanStep[] = [
  { label: "Front View", instruction: "Smile and look straight at the camera." },
  { label: "Left View", instruction: "Turn your head to the left." },
  { label: "Right View", instruction: "Turn your head to the right." },
  { label: "Upper Teeth", instruction: "Tilt your head back and open wide." },
  { label: "Lower Teeth", instruction: "Tilt your head down and open wide." },
] as const;

const CAPTURE_READY_THRESHOLD = 80;
const STABILITY_TICK_MS = 200;          // 5fps — well below the 10fps ceiling
const STABILITY_WARMUP_MS = 2000;       // camera must run this long before stability can build
const STABILITY_STILL_MS = 150;         // any motion within this window resets the score
const POST_CAPTURE_DELAY_MS = 1500;
const SCAN_ID_PREFIX = "scan_";
const NOTIFY_RETRY_COUNT = 2;
const NOTIFY_RETRY_DELAY_MS = 1500;

export default function ScanningFlow() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Tracks whether we're mid-capture so unmount knows whether to skip the advance callback.
  const captureActiveRef = useRef(false);

  // All mutable timing state lives in refs — avoids every stale-closure problem with async timers.
  const lastMotionTimeRef = useRef<number>(Date.now());
  const stabilityRef = useRef<number>(0);
  const cameraOpenTimeRef = useRef<number>(0);

  // Track whether the device supports DeviceMotionEvent.
  // On desktop (no DeviceMotion), we use a more lenient stability model.
  const hasDeviceMotionRef = useRef(false);

  const [camReady, setCamReady] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [stabilityScore, setStabilityScore] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: "" });
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  // Cleanup on unmount — only clear timers, no setState calls.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, []);

  // Single stable stability loop — startStabilityLoop itself never changes, so the camera
  // effect depends on it once and never re-runs. Refs inside tick are always current.
  const startStabilityLoop = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    const tick = () => {
      if (!mountedRef.current) return;

      const now = Date.now();
      const timeSinceMotion = now - lastMotionTimeRef.current;
      const openDuration = now - cameraOpenTimeRef.current;

      if (openDuration >= STABILITY_WARMUP_MS && timeSinceMotion > STABILITY_STILL_MS) {
        stabilityRef.current = Math.min(100, stabilityRef.current + 1);
      } else if (timeSinceMotion <= STABILITY_STILL_MS) {
        stabilityRef.current = 0;
      }

      setStabilityScore(stabilityRef.current);
      pollingTimerRef.current = setTimeout(tick, STABILITY_TICK_MS);
    };

    pollingTimerRef.current = setTimeout(tick, STABILITY_TICK_MS);
  }, []);

  // Register motion listeners once. No deps — effect runs once on mount, cleans up on unmount.
  // Desktop fix: Only register mousemove if DeviceMotionEvent is NOT supported.
  // This prevents the impossible-to-capture bug where moving the mouse to click
  // the capture button resets stability.
  useEffect(() => {
    const handleMotion = () => {
      lastMotionTimeRef.current = Date.now();
      stabilityRef.current = 0;
      setStabilityScore(0);
    };

    if (typeof DeviceMotionEvent !== "undefined" && "ontouchstart" in window) {
      // Mobile device — use real device motion and touch events.
      hasDeviceMotionRef.current = true;
      window.addEventListener("devicemotion", handleMotion);
      window.addEventListener("touchmove", handleMotion);
    }
    // Desktop: we intentionally do NOT add mousemove as a motion detector.
    // On desktop, stability builds automatically after the warmup period.
    // The user can still trigger a reset by touching/scrolling on a touch-enabled laptop.

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      window.removeEventListener("touchmove", handleMotion);
    };
  }, []);

  // Camera init. Uses a ref to the loop starter so the dep array is stable (never causes re-init).
  useEffect(() => {
    let mounted = true;
    const stableLoopRef = { startStabilityLoop };

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        // Guard: if component unmounted during the await, release the camera immediately.
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        cameraOpenTimeRef.current = Date.now();
        lastMotionTimeRef.current = Date.now();

        // Listen for camera disconnection (e.g., Bluetooth device removed, permission revoked).
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (mounted) {
              setCameraError("Camera disconnected. Please reconnect and reload.");
            }
          });
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (mounted) {
              setCamReady(true);
              stableLoopRef.startStabilityLoop();
            }
          };
        }
      } catch (err) {
        if (mounted) {
          const message =
            err instanceof Error ? err.message : "Camera access denied";
          setCameraError(message);
        }
      }
    }

    initCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Reason: stableLoopRef wraps startStabilityLoop so the dep array stays empty.
  // The function itself never changes (useCallback), so the camera effect runs once.

  // Send notification to clinic with retry logic.
  const notifyClinic = useCallback(async (scanId: string) => {
    setNotifyStatus("sending");

    for (let attempt = 0; attempt <= NOTIFY_RETRY_COUNT; attempt++) {
      try {
        const res = await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scanId, status: "completed" }),
        });

        if (res.ok) {
          if (mountedRef.current) setNotifyStatus("sent");
          return;
        }
      } catch (err) {
        console.error(`[ScanningFlow] Notify attempt ${attempt + 1} failed:`, err);
      }

      // Wait before retry (skip wait after last attempt).
      if (attempt < NOTIFY_RETRY_COUNT) {
        await new Promise((r) => setTimeout(r, NOTIFY_RETRY_DELAY_MS));
      }
    }

    if (mountedRef.current) setNotifyStatus("failed");
  }, []);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || stabilityScore < CAPTURE_READY_THRESHOLD || isCapturing) return;

    setIsCapturing(true);
    captureActiveRef.current = true;
    const video = videoRef.current;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsCapturing(false);
      captureActiveRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    setCaptureFlash(true);
    setTimeout(() => {
      if (mountedRef.current) setCaptureFlash(false);
    }, 200);

    // Haptic feedback on capture if available (mobile).
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(50);
    }

    if (mountedRef.current) {
      setToast({ visible: true, message: "Captured!" });
    }
    setCapturedImages((prev) => [...prev, dataUrl]);

    const nextStep = currentStep + 1;
    advanceTimerRef.current = setTimeout(() => {
      // captureActiveRef gate: if unmount fired before this fired, skip all state writes.
      if (!captureActiveRef.current || !mountedRef.current) return;
      captureActiveRef.current = false;

      setCurrentStep(nextStep);
      setIsCapturing(false);
      setToast({ visible: false, message: "" });

      if (nextStep >= STEPS.length) {
        const scanId = `${SCAN_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        setScanComplete(true);

        // Store captured images + scanId in sessionStorage so the results page can display them.
        // NOTE: Storing ~2-5MB of JPEG data URLs in sessionStorage is intentional for this
        // assessment scope. In production, images would be uploaded to cloud storage.
        try {
          sessionStorage.setItem("ds_captured_images", JSON.stringify([...capturedImages, dataUrl]));
          sessionStorage.setItem("ds_scan_id", scanId);
        } catch (err) {
          console.warn("[ScanningFlow] sessionStorage write failed:", err);
        }

        // Release camera since we're done scanning.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Notify with retry.
        notifyClinic(scanId);
      }
    }, POST_CAPTURE_DELAY_MS);
  }, [stabilityScore, isCapturing, currentStep, capturedImages, notifyClinic]);

  const handleViewResults = useCallback(() => {
    const scanId = sessionStorage.getItem("ds_scan_id") ?? "";
    router.push(`/results?scanId=${encodeURIComponent(scanId)}`);
  }, [router]);

  const handleRestart = useCallback(() => {
    setScanComplete(false);
    setCurrentStep(0);
    setCapturedImages([]);
    setStabilityScore(0);
    stabilityRef.current = 0;
    setCamReady(false);
    setCameraError(null);
    setNotifyStatus("idle");
    setToast({ visible: false, message: "" });

    // Re-init camera.
    async function reinit() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        cameraOpenTimeRef.current = Date.now();
        lastMotionTimeRef.current = Date.now();
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (mountedRef.current) setCameraError("Camera disconnected. Please reconnect and reload.");
          });
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (mountedRef.current) {
              setCamReady(true);
              startStabilityLoop();
            }
          };
        }
      } catch (err) {
        if (mountedRef.current) {
          setCameraError(err instanceof Error ? err.message : "Camera access denied");
        }
      }
    }
    reinit();
  }, [startStabilityLoop]);

  // Keyboard capture: Space/Enter can trigger capture on desktop (accessibility).
  useEffect(() => {
    const handleKeyCapture = (e: KeyboardEvent) => {
      if (e.code === "Space" && currentStep < STEPS.length && !scanComplete) {
        e.preventDefault();
        handleCapture();
      }
    };
    window.addEventListener("keydown", handleKeyCapture);
    return () => window.removeEventListener("keydown", handleKeyCapture);
  }, [handleCapture, currentStep, scanComplete]);

  const isCaptureReady = stabilityScore >= CAPTURE_READY_THRESHOLD && !isCapturing;

  return (
    <div className="flex flex-col items-center bg-black min-h-screen text-white">
      {/* Header */}
      <div className="p-4 w-full bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
        <h1 className="font-bold text-blue-400">DentalScan AI</h1>
        <span className="text-xs text-zinc-500 font-medium">
          Step {Math.min(currentStep + 1, STEPS.length)}/{STEPS.length}
        </span>
      </div>

      {/* Step progress bar */}
      <div className="w-full max-w-md px-4 pt-3">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1 rounded-full transition-all duration-500"
              style={{
                backgroundColor:
                  i < currentStep
                    ? "#22c55e"
                    : i === currentStep
                    ? "#3b82f6"
                    : "#27272a",
              }}
            />
          ))}
        </div>
        {currentStep < STEPS.length && (
          <p className="text-xs text-zinc-400 font-medium mt-2 text-center">
            {STEPS[currentStep].label}
          </p>
        )}
      </div>

      {/* Main viewport */}
      <div className="relative w-full max-w-md aspect-[3/4] bg-zinc-950 overflow-hidden flex items-center justify-center rounded-2xl border border-zinc-800 mt-3 mx-4">
        {!scanComplete && currentStep < STEPS.length ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                camReady ? "opacity-90" : "opacity-0"
              }`}
            />

            {/* Camera loading */}
            {!camReady && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Camera className="w-12 h-12 text-zinc-700 animate-pulse mb-3" />
                <p className="text-sm text-zinc-500">Starting camera...</p>
              </div>
            )}

            {/* Permission denied / Camera error */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                <X className="w-12 h-12 text-red-500 mb-3" />
                <p className="text-sm text-red-400 font-medium mb-2">
                  Camera access required
                </p>
                <p className="text-xs text-zinc-500">
                  {cameraError}
                </p>
                <p className="text-xs text-zinc-600 mt-2">
                  Please allow camera access in your browser settings and reload
                  the page.
                </p>
              </div>
            )}

            {/* Mouth guide */}
            {camReady && !cameraError && (
              <MouthGuideOverlay stabilityScore={stabilityScore} />
            )}

            {/* Capture flash */}
            {captureFlash && (
              <div className="absolute inset-0 bg-green-500/30 pointer-events-none transition-opacity duration-200" />
            )}

            {/* Instruction */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent text-center">
              <p className="text-sm font-medium text-white">
                {STEPS[currentStep].instruction}
              </p>
              {!hasDeviceMotionRef.current && camReady && (
                <p className="text-[10px] text-zinc-500 mt-1">
                  Press Space or click the capture button when ready
                </p>
              )}
            </div>
          </>
        ) : (
          /* Scan complete view */
          <div className="flex flex-col items-center justify-center w-full h-full p-8 gap-6">
            {/* Success icon */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-green-500/20 blur-xl" />
              <CheckCircle2 size={56} className="relative text-green-500" />
            </div>

            {/* Heading */}
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Scan Complete</h2>
              <p className="text-zinc-400 text-sm mt-1">
                All 5 views captured successfully.
              </p>
            </div>

            {/* Notification status */}
            <div className="text-center">
              {notifyStatus === "sending" && (
                <p className="text-xs text-amber-400 animate-pulse">Notifying clinic...</p>
              )}
              {notifyStatus === "sent" && (
                <p className="text-xs text-green-400">✓ Clinic notified</p>
              )}
              {notifyStatus === "failed" && (
                <p className="text-xs text-red-400">
                  Clinic notification failed.{" "}
                  <button
                    onClick={() => {
                      const id = sessionStorage.getItem("ds_scan_id");
                      if (id) notifyClinic(id);
                    }}
                    className="underline hover:text-red-300 transition-colors"
                  >
                    Retry
                  </button>
                </p>
              )}
            </div>

            {/* Captured views preview */}
            <div className="w-full flex flex-col gap-3">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider text-center">
                Captured Views
              </p>
              <div className="w-full grid grid-cols-5 gap-2">
                {["Front", "Left", "Right", "Upper", "Lower"].map((view, i) => (
                  <div
                    key={view}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-green-600/50 bg-zinc-900 shadow-sm">
                      {capturedImages[i] ? (
                        <img
                          src={capturedImages[i]}
                          alt={`${view} view capture`}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                      {/* Step number badge */}
                      <div className="absolute top-1 left-1 bg-black/60 text-[9px] text-white font-semibold px-1 py-0.5 rounded-md">
                        {i + 1}
                      </div>
                      {/* Checkmark badge */}
                      <div className="absolute top-1 right-1 bg-green-600 text-white rounded-full p-0.5">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    <span className="text-[9px] text-zinc-500 font-medium leading-tight text-center">
                      {view}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex gap-3 w-full max-w-xs">
              <button
                onClick={handleRestart}
                className="flex-1 flex items-center justify-center gap-1.5 border border-zinc-700 hover:border-zinc-600 text-zinc-300 text-sm font-medium px-4 py-3 rounded-xl transition-all duration-200"
              >
                <RotateCcw size={14} />
                Redo
              </button>
              <button
                onClick={handleViewResults}
                className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold px-6 py-3 rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all duration-200"
              >
                View Results
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast.visible && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg animate-fade-in z-10">
          {toast.message}
        </div>
      )}

      {/* Capture button */}
      <div className="p-8 w-full flex justify-center">
        {!scanComplete && currentStep < STEPS.length && (
          <button
            onClick={handleCapture}
            disabled={!isCaptureReady}
            aria-label={isCaptureReady ? "Capture photo" : "Hold still to stabilize"}
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-300 ${
              isCaptureReady
                ? "border-white bg-transparent scale-100 active:scale-95 hover:shadow-xl hover:shadow-white/10"
                : "border-zinc-600 bg-transparent scale-95 opacity-50 cursor-not-allowed"
            }`}
          >
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                isCaptureReady
                  ? "bg-white shadow-lg shadow-white/20"
                  : "bg-zinc-700"
              }`}
            >
              <Camera
                className={`transition-colors duration-300 ${
                  isCaptureReady ? "text-black" : "text-zinc-500"
                }`}
              />
            </div>
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {!scanComplete && (
        <div className="flex gap-2 px-3 pb-3 overflow-x-auto w-full">
          {STEPS.map((step, i) => (
            <div
              key={step.label}
              className={`flex flex-col items-center gap-1 shrink-0 transition-all duration-200 ${
                i === currentStep ? "opacity-100 scale-105" : capturedImages[i] ? "opacity-80" : "opacity-40"
              }`}
            >
              <div
                className={`w-14 h-14 rounded-xl border-2 overflow-hidden transition-colors duration-200 ${
                  i === currentStep
                    ? "border-blue-500"
                    : capturedImages[i]
                    ? "border-green-600/60"
                    : "border-zinc-800"
                }`}
              >
                {capturedImages[i] ? (
                  <img
                    src={capturedImages[i]}
                    alt={step.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera size={12} className="text-zinc-700" />
                  </div>
                )}
              </div>
              <span
                className={`text-[9px] font-medium leading-tight text-center whitespace-nowrap ${
                  i === currentStep ? "text-blue-400" : "text-zinc-500"
                }`}
              >
                {step.label.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
