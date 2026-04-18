"use client";

// MessageSidebar — quick-message panel for patient-dentist chat on scan results.
// Slides in from the right, supports optimistic updates, auto-scrolls to latest message.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, X, RefreshCw } from "lucide-react";
import type { Message, Thread, Sender } from "@/lib/types";
import { MAX_MESSAGE_LENGTH } from "@/lib/types";

interface Props {
  scanId: string;
  patientId: string;
  onClose: () => void;
}

export default function MessageSidebar({ scanId, patientId, onClose }: Props) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Separate abort controllers for load and send — prevents the race condition where
  // a send overwrites the load controller, leaving the load fetch un-abortable.
  const loadAbortRef = useRef<AbortController | null>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);

  // Track mounted state to prevent setState after unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      sendAbortRef.current?.abort();
      sendAbortRef.current = null;
    };
  }, []);

  // Fetch thread + message history on mount.
  const loadThread = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setLoading(true);
      setFetchError(null);

      loadAbortRef.current = new AbortController();
      const res = await fetch(
        `/api/messaging?patientId=${encodeURIComponent(patientId)}`,
        { signal: loadAbortRef.current.signal }
      );

      if (!mountedRef.current) return;

      if (res.ok) {
        const data = await res.json();
        setThread(data.thread ?? null);
        setMessages(data.messages ?? []);
      } else {
        setFetchError("Failed to load messages.");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setFetchError("Network error. Please try again.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close sidebar on Escape key.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Auto-resize textarea as user types.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft]);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;

    const clientId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Message = {
      id: clientId,
      content,
      sender: "patient" as Sender,
      createdAt: new Date().toISOString(),
      clientId,
      failed: false,
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setSending(true);

    try {
      sendAbortRef.current = new AbortController();

      // FIX: When no thread exists, send only patientId (no threadId).
      // Previously this sent threadId = patientId, which caused a 404
      // because the API looks up a thread by that ID and doesn't find one.
      const payload: Record<string, string> = {
        patientId,
        content,
        sender: "patient",
        clientId,
      };
      if (thread?.id) {
        payload.threadId = thread.id;
      }

      const res = await fetch("/api/messaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: sendAbortRef.current.signal,
      });

      sendAbortRef.current = null;

      if (!mountedRef.current) return;

      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === clientId ? { ...m, failed: true } : m))
        );
        return;
      }

      const data = await res.json();
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== clientId);
        return [...without, data.message];
      });

      if (!thread && data.threadId) {
        setThread({ id: data.threadId, patientId, messages: [] });
      }
    } catch (err) {
      // AbortError means the component was unmounted — leave no orphan state.
      if (err instanceof Error && err.name === "AbortError") return;
      if (!mountedRef.current) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === clientId ? { ...m, failed: true } : m))
      );
      sendAbortRef.current = null;
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [draft, sending, thread, patientId]);

  const retryMessage = useCallback(
    (msg: Message) => {
      setDraft(msg.content);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      textareaRef.current?.focus();
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const charCount = draft.length;
  const charWarning = charCount > MAX_MESSAGE_LENGTH * 0.9;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <div
        className="fixed inset-y-0 right-0 w-full max-w-sm bg-zinc-900 border-l border-zinc-700 flex flex-col z-50 shadow-2xl animate-slide-in-right"
        role="dialog"
        aria-label="Chat with your dentist"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm font-semibold text-white">Chat with your dentist</p>
            <p className="text-xs text-zinc-500">Scan #{scanId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
            aria-label="Close chat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-end gap-2">
                  <div
                    className="h-10 bg-zinc-800 rounded-2xl rounded-bl-md animate-pulse"
                    style={{ width: `${[128, 96, 160][i]}px` }}
                  />
                </div>
              ))}
            </>
          )}

          {!loading && fetchError && (
            <div className="flex flex-col items-center gap-2 mt-8 text-center">
              <p className="text-sm text-red-400">{fetchError}</p>
              <button
                onClick={loadThread}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {!loading && !fetchError && messages.length === 0 && (
            <div className="flex flex-col items-center mt-12 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                <Send size={18} className="text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500">No messages yet.</p>
              <p className="text-xs text-zinc-600 mt-1">
                Ask a question about your scan — your dentist will respond here.
              </p>
            </div>
          )}

          {!loading &&
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${
                  msg.sender === "patient" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm transition-all duration-200 ${
                    msg.sender === "patient"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
                  } ${msg.failed ? "opacity-60 border border-red-500" : ""}`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="text-[10px] mt-1 opacity-60">
                    {msg.failed
                      ? "Failed to send"
                      : new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                  </p>
                </div>

                {msg.failed && (
                  <button
                    onClick={() => retryMessage(msg)}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-red-400 hover:text-red-300 transition-colors"
                    title="Retry"
                    aria-label="Retry sending message"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
              </div>
            ))}

          <div ref={scrollEndRef} />
        </div>

        {/* Composer */}
        <div className="p-3 border-t border-zinc-700 shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 resize-none placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[44px] max-h-[132px]"
                aria-label="Message input"
              />
              {/* Character count */}
              {charCount > 0 && (
                <span
                  className={`absolute bottom-1 right-2 text-[10px] transition-colors ${
                    charWarning ? "text-amber-400" : "text-zinc-600"
                  }`}
                >
                  {charCount}/{MAX_MESSAGE_LENGTH}
                </span>
              )}
            </div>
            <button
              onClick={sendMessage}
              disabled={!draft.trim() || sending}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white shrink-0"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
