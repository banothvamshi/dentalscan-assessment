// e2e/api.spec.ts — API route tests for /api/notify and /api/messaging.
// Validates request validation, response shapes, edge cases, and transaction integrity.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

// ─── /api/notify ────────────────────────────────────────────────────────────

test.describe("POST /api/notify", () => {
  test("returns 400 when scanId is missing", async ({ request }) => {
    const res = await request.post(`${BASE}/api/notify`, {
      data: { status: "completed" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("scanId");
  });

  test("returns 400 when status is missing", async ({ request }) => {
    const res = await request.post(`${BASE}/api/notify`, {
      data: { scanId: "test_missing_status" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("status");
  });

  test("returns 400 for excessively long scanId", async ({ request }) => {
    const res = await request.post(`${BASE}/api/notify`, {
      data: { scanId: "x".repeat(300), status: "completed" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid scanId");
  });

  test("creates notification for completed scan", async ({ request }) => {
    const scanId = `test_${Date.now()}`;
    const res = await request.post(`${BASE}/api/notify`, {
      data: { scanId, status: "completed" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notificationId).toBeTruthy();
  });

  test("returns 200 with no DB write for non-completed status", async ({ request }) => {
    const res = await request.post(`${BASE}/api/notify`, {
      data: { scanId: "test_pending", status: "pending" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notificationId).toBeUndefined();
  });

  test("handles duplicate scanId gracefully (upsert)", async ({ request }) => {
    const scanId = `test_dup_${Date.now()}`;

    const res1 = await request.post(`${BASE}/api/notify`, {
      data: { scanId, status: "completed" },
    });
    expect(res1.status()).toBe(200);

    const res2 = await request.post(`${BASE}/api/notify`, {
      data: { scanId, status: "completed" },
    });
    expect(res2.status()).toBe(200);
  });
});

test.describe("GET /api/notify", () => {
  test("returns notifications array", async ({ request }) => {
    const res = await request.get(`${BASE}/api/notify`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.notifications)).toBe(true);
  });
});

test.describe("PATCH /api/notify", () => {
  test("returns 400 when notificationId is missing", async ({ request }) => {
    const res = await request.patch(`${BASE}/api/notify`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 for non-existent notificationId", async ({ request }) => {
    const res = await request.patch(`${BASE}/api/notify`, {
      data: { notificationId: "does_not_exist" },
    });
    expect(res.status()).toBe(404);
  });

  test("marks notification as read", async ({ request }) => {
    // First create a notification.
    const scanId = `test_patch_${Date.now()}`;
    const createRes = await request.post(`${BASE}/api/notify`, {
      data: { scanId, status: "completed" },
    });
    const { notificationId } = await createRes.json();

    // Then mark it as read.
    const patchRes = await request.patch(`${BASE}/api/notify`, {
      data: { notificationId },
    });
    expect(patchRes.status()).toBe(200);
    const body = await patchRes.json();
    expect(body.ok).toBe(true);
  });
});

// ─── /api/messaging ─────────────────────────────────────────────────────────

test.describe("GET /api/messaging", () => {
  test("returns 400 when neither threadId nor patientId is provided", async ({ request }) => {
    const res = await request.get(`${BASE}/api/messaging`);
    expect(res.status()).toBe(400);
  });

  test("returns 200 with empty data for unknown patientId", async ({ request }) => {
    const res = await request.get(`${BASE}/api/messaging?patientId=unknown_patient_xyz`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.thread).toBeNull();
    expect(body.messages).toEqual([]);
  });
});

test.describe("POST /api/messaging", () => {
  test("returns 400 when content is empty", async ({ request }) => {
    const res = await request.post(`${BASE}/api/messaging`, {
      data: { patientId: "test_patient", content: "", sender: "patient" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 when content is whitespace only", async ({ request }) => {
    const res = await request.post(`${BASE}/api/messaging`, {
      data: { patientId: "test_patient", content: "   ", sender: "patient" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 when content exceeds 500 characters", async ({ request }) => {
    const res = await request.post(`${BASE}/api/messaging`, {
      data: {
        patientId: "test_patient",
        content: "x".repeat(501),
        sender: "patient",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("500");
  });

  test("returns 400 for invalid sender value", async ({ request }) => {
    const res = await request.post(`${BASE}/api/messaging`, {
      data: { patientId: "test_patient", content: "Hello", sender: "admin" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 when neither threadId nor patientId is provided", async ({ request }) => {
    const res = await request.post(`${BASE}/api/messaging`, {
      data: { content: "Hello", sender: "patient" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 for non-existent threadId", async ({ request }) => {
    const res = await request.post(`${BASE}/api/messaging`, {
      data: { threadId: "nonexistent_thread_id", content: "Hello", sender: "patient" },
    });
    expect(res.status()).toBe(404);
  });

  test("creates message and thread for new patient", async ({ request }) => {
    const patientId = `test_patient_${Date.now()}`;
    const res = await request.post(`${BASE}/api/messaging`, {
      data: {
        patientId,
        content: "Hello, I have a question about my scan.",
        sender: "patient",
        clientId: "test_client_1",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message.content).toBe("Hello, I have a question about my scan.");
    expect(body.message.sender).toBe("patient");
    expect(body.message.clientId).toBe("test_client_1");
    expect(body.threadId).toBeTruthy();
  });

  test("adds message to existing thread via threadId", async ({ request }) => {
    const patientId = `test_patient_thread_${Date.now()}`;

    // Create first message (and thread).
    const res1 = await request.post(`${BASE}/api/messaging`, {
      data: { patientId, content: "First message", sender: "patient" },
    });
    const { threadId } = await res1.json();

    // Add to existing thread.
    const res2 = await request.post(`${BASE}/api/messaging`, {
      data: { threadId, content: "Follow-up message", sender: "dentist" },
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.message.content).toBe("Follow-up message");
    expect(body2.message.sender).toBe("dentist");
    expect(body2.threadId).toBe(threadId);
  });

  test("reuses existing thread when same patientId sends again", async ({ request }) => {
    const patientId = `test_reuse_${Date.now()}`;

    const res1 = await request.post(`${BASE}/api/messaging`, {
      data: { patientId, content: "First", sender: "patient" },
    });
    const { threadId: tid1 } = await res1.json();

    const res2 = await request.post(`${BASE}/api/messaging`, {
      data: { patientId, content: "Second", sender: "patient" },
    });
    const { threadId: tid2 } = await res2.json();

    expect(tid1).toBe(tid2);
  });

  test("GET returns messages after POST", async ({ request }) => {
    const patientId = `test_get_after_post_${Date.now()}`;

    await request.post(`${BASE}/api/messaging`, {
      data: { patientId, content: "Test message", sender: "patient" },
    });

    const res = await request.get(`${BASE}/api/messaging?patientId=${patientId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.thread).toBeTruthy();
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.messages[0].content).toBe("Test message");
  });
});
