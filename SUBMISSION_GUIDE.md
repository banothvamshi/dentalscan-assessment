# Submission Guide

This guide walks the reviewer through every feature so nothing is missed during evaluation.

## Running the app

```bash
npm install
npx prisma generate
npx prisma migrate dev --name "init"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Running tests

```bash
npx playwright test
```

---

## Feature 1 — Scanning Flow (`/`)

The home page (`src/app/page.tsx`) renders `ScanningFlow.tsx`.

### What to test

**Camera initialization**
- On first load, a pulsing camera icon appears with "Starting camera..." text
- After ~1s the live video feed fades in at reduced opacity
- The mouth guide overlay appears overlaid on the video

**Stability guide**
- The SVG mouth ellipse shows red (0–39), amber (40–79), green (80–100) as the score builds
- The pill badge above the guide reads "Hold still...", "Almost...", then "Ready ✓"
- On mobile: score resets when the device moves or the screen is touched
- On desktop: score builds automatically after a 2s warmup (mouse movement does NOT reset stability)
- The status text announces changes to screen readers (`aria-live="polite"`)

**Step progress bar**
- A 5-segment progress bar at the top shows green (done), blue (current), dark (upcoming)
- The current step label is displayed below the progress bar

**Capture button**
- Disabled (gray) until stability reaches 80
- Transitions to white with shadow and smooth scale animation when ready
- On desktop: pressing Space also triggers capture
- Tapping captures a frame, flashes the viewport green for 200ms, and shows "Captured!" toast
- On mobile: haptic feedback (vibration) on capture
- Disabled again during the 1.5s post-capture delay (prevents double-capture)

**Step progression**
- Thumbnails at the bottom show the 5 steps; the current step is highlighted blue with a subtle scale effect
- After 5 captures the screen transitions to "Scan Complete"

**Scan complete screen**
- Shows notification status: "Notifying clinic..." → "✓ Clinic notified"
- If notification fails, shows "Retry" button
- "View Results" navigates to `/results?scanId=<id>`
- "Redo" button restarts the scanning flow

**Post-scan notification**
- `POST /api/notify` fires with the generated scanId and `status: "completed"`
- The request retries up to 2 times on failure with 1.5s delay between attempts
- Captured images are stored in sessionStorage so the results page can display them

**Permission denied**
- Deny camera permission in browser settings and reload
- A red error screen appears with "Camera access required" and the specific error message

**Camera disconnection**
- If the camera stream ends mid-session (e.g., Bluetooth device removed), an error state appears

---

## Feature 2 — Results Page (`/results`)

### What to test

**Layout**
- "Scan Complete" heading with green checkmark
- AI Analysis panel with animated shimmer skeleton bars
- Captured views display: shows actual captured images from the scan flow (via sessionStorage)
- "What happens next" section with 3 steps

**Notification bell**
- Bell icon in the header
- Shows unread notification count badge (red circle with number)
- Clicking the bell refreshes the notification count

**Chat sidebar**
- Clicking the floating "Chat with your dentist" button opens the sidebar with a backdrop overlay
- Closes on X button, Escape key, or clicking the backdrop
- 3 skeleton bubbles appear during the initial fetch
- If no thread exists yet: "No messages yet" empty state
- Type a message and hit Send — the optimistic bubble appears immediately
- The real message replaces the optimistic one when the server responds
- Failed sends show a red border, "Failed to send" timestamp, and a retry icon
- Clicking retry restores the text and removes the failed bubble
- Pressing Enter sends without Shift; Shift+Enter adds a new line
- Character count appears as you type (e.g., "42/500")
- Warning color when approaching the 500 char limit
- Sidebar has proper ARIA labels (role="dialog", aria-label)

---

## Feature 3 — API Routes

### `POST /api/notify`

```bash
# Triggers notification + scan status update
curl -X POST http://localhost:3000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"scanId":"scan_test_001","status":"completed"}'

# Response: { "ok": true, "notificationId": "cmoxxx" }
```

Missing `scanId` or `status` → 400. Excessively long `scanId` (>200 chars) → 400. Non-"completed" status → 200 with no DB write.

### `GET /api/notify`

```bash
curl http://localhost:3000/api/notify
# Response: { "ok": true, "notifications": [...] }
```

Returns the 5 most recent unread notifications for the default clinic user.

### `PATCH /api/notify`

```bash
curl -X PATCH http://localhost:3000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"notificationId":"<id>"}'
# Response: { "ok": true }
```

Missing `notificationId` → 400. Non-existent ID → 404.

### `GET /api/messaging?patientId=<id>`

```bash
curl "http://localhost:3000/api/messaging?patientId=patient_001"
```

Returns `{ "thread": null, "messages": [] }` if no thread exists (200, not 404). Returns 400 if both `threadId` and `patientId` are missing.

### `POST /api/messaging`

```bash
# New thread (no threadId needed, just patientId)
curl -X POST http://localhost:3000/api/messaging \
  -H "Content-Type: application/json" \
  -d '{"patientId":"patient_001","content":"Hello","sender":"patient"}'

# Add to existing thread
curl -X POST http://localhost:3000/api/messaging \
  -H "Content-Type: application/json" \
  -d '{"threadId":"<thread-id>","content":"Follow-up","sender":"dentist"}'
```

Returns 400 for: empty content, whitespace-only content, content >500 chars, invalid sender, missing identifiers.
Returns 404 for a non-existent `threadId`.

---

## Architecture notes

- **Prisma singleton**: `src/lib/prisma.ts` uses `globalThis` pattern to prevent connection exhaustion during Next.js hot reload
- **Shared types**: `src/lib/types.ts` centralizes all TypeScript interfaces and validation constants
- **Stability loop**: All timing state lives in refs — no stale closure risk across async timers
- **Desktop stability**: Mouse movement does NOT reset stability — only DeviceMotion (mobile) and touchmove do
- **Camera unmount guard**: If the component unmounts during `getUserMedia`, the stream is released and no `setState` fires
- **Camera disconnect**: `track.onended` listener detects camera disconnection mid-session
- **Transaction**: Notification + Scan writes in `POST /api/notify` are atomic via `prisma.$transaction`
- **Thread creation**: Uses a transaction to prevent duplicate thread creation under concurrent POST requests
- **Optimistic UI**: MessageSidebar uses a client-generated `clientId`; the server echoes it back for reconciliation
- **AbortController**: Separate refs for load and send operations — prevents the race condition where one overwrites the other
- **Server-side validation**: Content length (500 chars), sender enum, and scanId format are validated server-side
- **Indexes**: `Notification(userId)`, `Thread(patientId)`, `Message(threadId)` for query performance

## Running tests

```bash
# All tests
npx playwright test

# API tests only
npx playwright test e2e/api.spec.ts

# UI tests only
npx playwright test e2e/messaging-ui.spec.ts
npx playwright test e2e/results-page.spec.ts
```
