// Shared type definitions for the DentalScan application.

// ─── Messaging ──────────────────────────────────────────────────────────────

export type Sender = "patient" | "dentist";

export interface Message {
  id: string;
  content: string;
  sender: Sender;
  createdAt: Date | string;
  clientId?: string;
  /** True when an optimistic send failed and the user can retry. */
  failed?: boolean;
}

export interface Thread {
  id: string;
  patientId: string;
  messages: Message[];
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  scanId: string | null;
  createdAt: string;
}

// ─── Scanning ───────────────────────────────────────────────────────────────

export interface ScanStep {
  label: string;
  instruction: string;
}

export interface ToastState {
  visible: boolean;
  message: string;
}

// ─── API Responses ──────────────────────────────────────────────────────────

export interface NotifyPostResponse {
  ok: boolean;
  notificationId?: string;
  error?: string;
}

export interface NotifyGetResponse {
  ok: boolean;
  notifications: Notification[];
  error?: string;
}

export interface MessagingGetResponse {
  thread: Thread | null;
  messages: Message[];
  error?: string;
}

export interface MessagingPostResponse {
  ok: boolean;
  message: Message;
  threadId: string;
  error?: string;
}

// ─── Validation Constants ───────────────────────────────────────────────────

/** Maximum length for a chat message (enforced client + server). */
export const MAX_MESSAGE_LENGTH = 500;

/** Valid sender values for messaging API. */
export const VALID_SENDERS: readonly Sender[] = ["patient", "dentist"] as const;
