# DentalScan AI

A full-stack dental scan management system built on **Next.js 14**, **Prisma**, and **Tailwind CSS**.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── messaging/route.ts   ← Thread + Message CRUD with optimistic reconciliation
│   │   └── notify/route.ts      ← Notification trigger + read/unread + SMS stub
│   ├── results/page.tsx         ← Post-scan dashboard with AI analysis + chat sidebar
│   ├── layout.tsx               ← Root layout with Inter font + viewport meta
│   ├── globals.css              ← Custom animations (shimmer, slide, pulse)
│   └── page.tsx                 ← Scanning flow entry point
├── components/
│   ├── ScanningFlow.tsx         ← Camera init, stability detection, 5-step capture
│   ├── MouthGuideOverlay.tsx    ← SVG mouth guide with color-coded stability
│   └── MessageSidebar.tsx       ← Patient-dentist chat with optimistic UI
└── lib/
    ├── prisma.ts                ← Prisma singleton (hot-reload safe)
    └── types.ts                 ← Shared TypeScript types + validation constants
```

## What Was Built

| Feature | Type | Description |
|---------|------|-------------|
| Scanning Flow (`/`) | Frontend | Camera interface with mouth guide overlay, DeviceMotionEvent stability detection, per-step frame capture, haptic feedback, keyboard shortcuts |
| Results Page (`/results`) | Frontend | Post-scan confirmation with AI analysis skeleton, notification bell, and floating chat button |
| Notification System (`/api/notify`) | Backend | POST creates notification + upserts scan (atomic transaction), GET returns unread, PATCH marks as read |
| Messaging System (`/api/messaging`) | Full-Stack | Thread-based patient-dentist messaging with optimistic updates, client ID reconciliation, and abort-on-unmount |

## Setup

```bash
npm install
npx prisma generate
npx prisma migrate dev --name "init"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the scanning flow, then `/results` for the results page.

## API Reference

### `POST /api/notify`
Creates a clinic notification when a scan completes.

**Request:**
```json
{ "scanId": "scan_abc123", "status": "completed" }
```

**Response `200`:**
```json
{ "ok": true, "notificationId": "cmoxxx" }
```

**Response `400`** — missing `scanId`, missing `status`, or invalid `scanId` format.

---

### `GET /api/notify`
Returns the 5 most recent unread notifications for the default clinic user.

**Response `200`:**
```json
{ "ok": true, "notifications": [{ "id", "title", "message", "read", "scanId", "createdAt" }] }
```

---

### `PATCH /api/notify`
Marks a specific notification as read.

**Request:**
```json
{ "notificationId": "cmoxxx" }
```

**Response `200`:** `{ "ok": true }`
**Response `404`** — notification not found.

---

### `GET /api/messaging?threadId=<id>` or `?patientId=<id>`
Fetches a thread and all its messages ordered chronologically.

**Response `200`:**
```json
{ "thread": { "id", "patientId", "messages": [...] }, "messages": [...] }
```

Returns `{ "thread": null, "messages": [] }` if no thread exists for the patient.
**Response `400`** — missing both `threadId` and `patientId`.

---

### `POST /api/messaging`
Creates a new message. If no `threadId` is provided, finds or creates a thread by `patientId` (transaction-protected to prevent duplicate thread creation under concurrency).

**Request:**
```json
{
  "threadId": "optional-existing-thread-id",
  "patientId": "patient_001",
  "content": "When should I schedule my follow-up?",
  "sender": "patient",
  "clientId": "optional-for-optimistic-ui"
}
```

**Response `200`:**
```json
{ "ok": true, "message": { ...created message, "clientId": "echoed-back" }, "threadId": "cmoxxx" }
```

**Response `400`** — empty/whitespace content, content exceeding 500 characters, invalid sender, or missing identifiers.
**Response `404`** — `threadId` provided but thread not found.

## Technical Decisions

### Stability Detection
Uses `DeviceMotionEvent` on mobile (real accelerometer data) and a timer-based warmup on desktop. On mobile, `touchmove` also resets stability. On desktop, mouse movement does **not** reset stability — this was intentional to prevent the impossible-to-capture bug where moving the mouse to click the capture button would reset the score.

### Optimistic Updates
`MessageSidebar` uses a client-generated `clientId` that the server echoes back. On success the optimistic entry is replaced by the server-confirmed message; on failure it's marked with a retry affordance. Separate `AbortController` refs for load and send operations prevent a race condition where one operation's abort could interfere with the other.

### Transactions
- `POST /api/notify` wraps Notification creation and Scan upsert in `prisma.$transaction` — guarantees atomic write.
- `POST /api/messaging` wraps thread lookup-or-create in a transaction — prevents duplicate thread creation under concurrent requests from the same patient.

### Performance
- `MouthGuideOverlay` is wrapped in `React.memo` — prevents re-render when parent state (e.g., `isCapturing`) changes.
- Stability loop state lives entirely in refs — no stale-closure risk and no unnecessary re-renders from mutable timer state.
- `PrismaClient` is a module-level singleton using the `globalThis` pattern — prevents connection exhaustion during Next.js hot reload.

### Image Persistence
Captured images are stored in `sessionStorage` as base64 JPEG data URLs so the results page can display actual captures. This is intentional for assessment scope — in production, images would be uploaded to cloud storage (S3/GCS).

## Testing

```bash
# Run e2e tests (starts dev server automatically)
npx playwright test

# Run with UI for debugging
npx playwright test --ui

# Run specific test file
npx playwright test e2e/api.spec.ts
```

## Database

SQLite (via Prisma). Run `npx prisma studio` to inspect data during development.

## Known Limitations & Future Work

- **Image storage**: Data URLs in sessionStorage are limited to ~5MB. Production would use pre-signed upload URLs to S3.
- **Real-time messaging**: Currently uses request-response. WebSocket or SSE would enable real-time dentist replies.
- **Authentication**: Uses hardcoded patient/clinic IDs. Production would integrate with a proper auth system.
- **SMS delivery**: Uses a stub logger. Production would integrate Twilio/Telnyx SDK with delivery receipts.
- **AI inference**: The analysis panel shows a static skeleton. Production would poll a real ML endpoint.
