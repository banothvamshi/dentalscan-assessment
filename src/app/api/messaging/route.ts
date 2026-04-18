import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAX_MESSAGE_LENGTH, VALID_SENDERS } from "@/lib/types";
import type { Sender } from "@/lib/types";

// GET /api/messaging?threadId=<id> or /api/messaging?patientId=<id>
// Returns thread + messages ordered asc. If neither param: 400. If not found: 200 with empty data.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");
    const patientId = searchParams.get("patientId");

    if (!threadId && !patientId) {
      return NextResponse.json(
        { error: "Missing threadId or patientId" },
        { status: 400 }
      );
    }

    let thread;
    if (threadId) {
      thread = await prisma.thread.findUnique({
        where: { id: threadId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    } else {
      // patientId lookup: find the most recently updated thread for this patient.
      thread = await prisma.thread.findFirst({
        where: { patientId: patientId! },
        include: { messages: { orderBy: { createdAt: "asc" } } },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (!thread) {
      return NextResponse.json(
        { thread: null, messages: [] },
        { status: 200 }
      );
    }

    return NextResponse.json({ thread, messages: thread.messages });
  } catch (err) {
    console.error("[messaging] GET error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/messaging — creates a new message.
// If threadId provided: adds message to that thread.
// If no threadId but patientId provided: upserts a thread first, then creates message.
// Accepts optional clientId for optimistic update reconciliation.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      threadId,
      patientId,
      content,
      sender,
      clientId,
    } = body as {
      threadId?: string;
      patientId?: string;
      content?: string;
      sender?: string;
      clientId?: string;
    };

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Server-side content length enforcement — mirrors the 500-char frontend limit.
    if (content.trim().length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `content must be ${MAX_MESSAGE_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    if (!sender || !VALID_SENDERS.includes(sender as Sender)) {
      return NextResponse.json(
        { error: "sender must be 'patient' or 'dentist'" },
        { status: 400 }
      );
    }

    let resolvedThreadId: string;

    if (threadId) {
      const thread = await prisma.thread.findUnique({ where: { id: threadId } });
      if (!thread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      resolvedThreadId = threadId;
    } else if (patientId) {
      // Use a transaction to prevent race condition: two concurrent POST requests
      // for the same new patient could both create separate threads.
      const result = await prisma.$transaction(async (tx) => {
        let thread = await tx.thread.findFirst({ where: { patientId } });
        if (!thread) {
          thread = await tx.thread.create({ data: { patientId } });
        }
        return thread;
      });
      resolvedThreadId = result.id;
    } else {
      return NextResponse.json(
        { error: "Either threadId or patientId must be provided" },
        { status: 400 }
      );
    }

    const message = await prisma.message.create({
      data: {
        threadId: resolvedThreadId,
        content: content.trim(),
        sender,
      },
    });

    return NextResponse.json({
      ok: true,
      message: { ...message, clientId },
      threadId: resolvedThreadId,
    });
  } catch (err) {
    console.error("[messaging] POST error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
