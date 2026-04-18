# DentalScan.us — Technical & UX Audit

## Camera Initialization: The Cold Start Problem

On mobile Safari, `getUserMedia` takes roughly 800ms to initialize on a cold start. The current flow throws users straight at a black screen with no loading indicator. One moment I'm reading the instruction, the next I'm staring at nothing. By the time the camera fires up, I've already second-guessed whether I granted permission. A skeleton loader or pulsing camera icon during this window would bridge the gap.

## Visual Framing: Patients Don't Know What "Right" Looks Like

There's no mouth guide on the scanning viewport. I'm supposed to capture five views — front, left, right, upper, lower — with zero visual reference for distance or angle. Blurry submissions are almost guaranteed, which means the AI gets garbage and the radiologist gets frustrated. An ellipse overlay that subtly pulses when you're in range would solve this immediately.

## Progress Anchoring: Where Am I in This Process?

The step counter shows "Step 2/5" in tiny zinc-500 text — easy to miss. Users need to feel progress. A persistent, bold step indicator with the view name would reduce abandonment.

## Permission Denied: The Silent Wall

If camera permission gets denied mid-flow, there's no graceful message. Just a frozen screen. A clear error state with an "Enable Camera" CTA would recover these users.

## Upload Resilience: No Net, No Safety

If the connection drops after capturing all five images, there's no retry. A per-capture upload with a retry queue would prevent total loss.

## Capture Feedback: Did That Work?

The capture button gives no confirmation — no flash, no haptic, no toast. A brief green pulse on the viewport plus haptic tap would close the feedback loop.

## Priority

Fix the mouth guide overlay first — it addresses the root input quality problem that cascades into AI accuracy and radiologist workload. Without proper framing, everything downstream suffers.
