"use client";

// Results page — displays scan completion state with AI analysis panel and dentist chat sidebar.
import React, { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, MessageCircle, Loader2, Sparkles, Bell, ArrowRight } from "lucide-react";
import MessageSidebar from "@/components/MessageSidebar";
import type { Notification } from "@/lib/types";

const DEFAULT_PATIENT_ID = "patient_001";

function ChatSkeleton() {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-zinc-900 border-l border-zinc-700 flex flex-col z-50">
      <div className="px-4 py-3 border-b border-zinc-700 shrink-0">
        <div className="h-5 w-40 bg-zinc-800 rounded animate-pulse" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="text-zinc-600 animate-spin" />
      </div>
    </div>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId") ?? "scan_abc123";
  const patientId = DEFAULT_PATIENT_ID;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  // Load captured images from sessionStorage (stored by ScanningFlow).
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("ds_captured_images");
      if (stored) {
        const images = JSON.parse(stored) as string[];
        setCapturedImages(images);
      }
    } catch {
      // Graceful fallback — show placeholder if sessionStorage fails.
    }
  }, []);

  // Fetch unread notifications.
  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await fetch("/api/notify");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {
      // Silent fail — notifications are non-critical.
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const viewLabels = ["Front", "Left", "Right", "Upper", "Lower"];

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center shrink-0">
        <h1 className="font-bold text-blue-400">DentalScan AI</h1>
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <button
            onClick={fetchNotifications}
            className="relative p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-notification-pop">
                {unreadCount}
              </span>
            )}
            {notifLoading && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
          </button>
          <span className="text-xs text-zinc-500 font-medium">
            Scan #{scanId.slice(0, 16)}
          </span>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 flex flex-col items-center px-6 py-8 max-w-2xl mx-auto w-full gap-6">

        {/* Completion header */}
        <div className="flex flex-col items-center gap-3 w-full">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-green-500/20 blur-3xl" />
            <div className="relative w-20 h-20 rounded-full border border-green-500/40 bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 size={36} className="text-green-500" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">Scan Complete</h2>
            <p className="text-zinc-400 text-sm mt-1 leading-relaxed">
              Your scan has been received and is being analyzed by our AI system.
            </p>
          </div>
        </div>

        {/* AI Analysis card */}
        <div className="w-full bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-sm rounded-2xl overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Sparkles size={15} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">AI Analysis in Progress</p>
              <p className="text-xs text-zinc-500">Powered by DentalScan AI</p>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium px-2.5 py-1 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Analyzing
            </div>
          </div>

          {/* Shimmer skeleton body */}
          <div className="px-5 py-4 space-y-3">
            {[
              "Extracting tooth boundaries and gum line geometry...",
              "Running decay detection on molar surfaces...",
              "Comparing against 50,000+ reference scans...",
              "Generating alignment and spacing report...",
            ].map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500/70 shrink-0 mt-0.5" />
                <div className="flex-1 h-3 bg-zinc-800/80 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${[82, 60, 40, 22][i]}%`,
                      background: "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.35) 40%, transparent 80%)",
                      animation: `shimmer 2s ease-in-out infinite`,
                      animationDelay: `${i * 0.5}s`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="px-5 pb-4 space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Scan processing</span>
              <span className="text-zinc-600">Est. ~2 min remaining</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-1000"
                style={{ width: "38%" }}
              />
            </div>
          </div>

          {/* Footer note */}
          <div className="px-5 pb-5">
            <p className="text-xs text-zinc-600 text-center leading-relaxed">
              You{"'"}ll receive a notification when your results are ready.
              Do not close this page.
            </p>
          </div>
        </div>

        {/* Captured views */}
        <div className="w-full bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 rounded-md bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 size={11} className="text-green-400" />
            </div>
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              5 of 5 Views Captured
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {viewLabels.map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-full aspect-square rounded-xl border border-zinc-700 bg-zinc-900/60 flex items-center justify-center overflow-hidden relative">
                  {capturedImages[i] ? (
                    <img
                      src={capturedImages[i]}
                      alt={`${label} view capture`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-zinc-600 font-bold">{i + 1}</span>
                  )}
                  <div className="absolute inset-0 bg-green-500/5" />
                </div>
                <span className="text-[10px] text-zinc-500 font-medium leading-tight text-center">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Next steps */}
        <div className="w-full bg-zinc-900/30 border border-zinc-800/30 rounded-2xl p-5 space-y-3">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            What happens next
          </p>
          <div className="space-y-2.5">
            {[
              { icon: Bell, text: "You'll receive a notification when AI analysis completes" },
              { icon: MessageCircle, text: "Chat with your dentist about any concerns" },
              { icon: ArrowRight, text: "Review detailed findings in your patient portal" },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full border flex items-center justify-center shrink-0 bg-zinc-800/80 border-zinc-700/60">
                  <step.icon size={11} className="text-zinc-500" />
                </div>
                <p className="text-xs leading-snug text-zinc-500">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating chat button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed bottom-6 right-6 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-5 py-3.5 rounded-full shadow-xl shadow-blue-600/25 transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-600/35 z-30"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        aria-label="Chat with your dentist"
      >
        <MessageCircle size={18} />
        <span className="text-sm font-semibold">Chat with your dentist</span>
      </button>

      {/* Chat sidebar */}
      {sidebarOpen && (
        <Suspense fallback={<ChatSkeleton />}>
          <MessageSidebar
            scanId={scanId}
            patientId={patientId}
            onClose={() => setSidebarOpen(false)}
          />
        </Suspense>
      )}
    </main>
  );
}

// Wrap in Suspense because useSearchParams requires it in Next.js App Router.
export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
