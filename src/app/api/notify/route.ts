import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Stub for Twilio-style SMS dispatch — replace with real SDK integration.
async function sendSMS(to: string, body: string): Promise<void> {
  const payload = {
    twilio_account_sid: process.env.TWILIO_ACCOUNT_SID ?? "ACxxxxxxxx",
    from: process.env.TWILIO_FROM_NUMBER ?? "+1XXXXXXXXXX",
    to,
    body,
  };
  console.log("[sendSMS] Twilio payload:", JSON.stringify(payload));
}

// POST /api/notify — triggers notification on scan completion.
// Creates Notification record, upserts Scan status, fires SMS stub in background.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, status } = body as { scanId?: string; status?: string };

    if (!scanId || !status) {
      return NextResponse.json(
        { error: "scanId and status are required" },
        { status: 400 }
      );
    }

    // Validate scanId format — prevent arbitrary string injection.
    if (typeof scanId !== "string" || scanId.length > 200) {
      return NextResponse.json(
        { error: "Invalid scanId format" },
        { status: 400 }
      );
    }

    if (status === "completed") {
      const result = await prisma.$transaction(async (tx) => {
        const notification = await tx.notification.create({
          data: {
            userId: "clinic-default",
            title: "New Scan Ready",
            message: `Scan ${scanId} has been completed and is ready for review.`,
            read: false,
            scanId,
          },
        });

        await tx.scan.upsert({
          where: { id: scanId },
          update: { status: "completed" },
          create: { id: scanId, status: "completed", images: "" },
        });

        return notification;
      });

      // Fire-and-forget: don't block response on SMS dispatch.
      void sendSMS("+1XXXXXXXXXX", `Scan ${scanId} complete. Review at dentalscan.us.`);

      return NextResponse.json({ ok: true, notificationId: result.id });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify] POST error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// GET /api/notify — returns the 5 most recent unread notifications for the default clinic user.
export async function GET() {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: "clinic-default", read: false },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ ok: true, notifications });
  } catch (err) {
    console.error("[notify] GET error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/notify — marks a notification as read.
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { notificationId } = body as { notificationId?: string };

    if (!notificationId || typeof notificationId !== "string") {
      return NextResponse.json(
        { error: "notificationId is required" },
        { status: 400 }
      );
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify] PATCH error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
