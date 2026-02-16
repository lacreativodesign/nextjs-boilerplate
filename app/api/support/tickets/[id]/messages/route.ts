import { NextResponse } from "next/server";
import { getCurrentUser, isAdminRole } from "@/app/api/admin/_utils";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

function toIso(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as any).toDate === "function") {
    const date = (value as any).toDate();
    return date instanceof Date ? date.toISOString() : null;
  }

  return null;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ticketId = context.params.id;
    const tenantId = normalizeTenantId(current.tenantId);

    const messagesRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("support_tickets")
      .doc(ticketId)
      .collection("messages");

    const messages = await messagesRef.orderBy("createdAt", "asc").get();

    return NextResponse.json({
      messages: messages.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: toIso(data.createdAt),
        };
      }),
    });
  } catch (error) {
    console.error("SUPPORT_MESSAGES_GET_ERROR", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ticketId = context.params.id;
    if (!ticketId) {
      return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
    }

    const body = await req.json().catch(() => null) as { content?: unknown; isInternal?: unknown } | null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (content.length < 2) {
      return NextResponse.json({ error: "Message content is required." }, { status: 400 });
    }

    const tenantId = normalizeTenantId(current.tenantId);
    const ticketRef = adminDb.collection("tenants").doc(tenantId).collection("support_tickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();

    if (!ticketSnap.exists) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const now = new Date();
    const payload = {
      ticketId,
      author: {
        uid: current.uid,
        name: typeof current.name === "string" && current.name.trim() ? current.name.trim() : "Unknown",
      },
      content,
      isInternal: Boolean(body?.isInternal),
      createdAt: now,
    };

    const messageRef = await ticketRef.collection("messages").add(payload);
    await ticketRef.set({ updatedAt: now }, { merge: true });

    return NextResponse.json({
      id: messageRef.id,
      ...payload,
      createdAt: now.toISOString(),
    });
  } catch (error) {
    console.error("SUPPORT_MESSAGES_POST_ERROR", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
