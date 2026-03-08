import { NextResponse } from "next/server";
import { getCurrentUser, isAdminRole } from "@/app/api/admin/_utils";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketCategory = "bug" | "feature" | "question" | "billing";

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

function parsePriority(value: unknown): TicketPriority {
  if (value === "low" || value === "medium" || value === "high" || value === "urgent") return value;
  return "medium";
}

function parseCategory(value: unknown): TicketCategory {
  if (value === "bug" || value === "feature" || value === "question" || value === "billing") return value;
  return "question";
}

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = normalizeTenantId(current.tenantId);

    const tickets = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("support_tickets")
      .orderBy("createdAt", "desc")
      .get();

    return NextResponse.json({
      tickets: tickets.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      }),
    });
  } catch (error) {
    console.error("SUPPORT_TICKETS_GET_ERROR", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = normalizeTenantId(current.tenantId);
    const data = await req.json().catch(() => null) as {
      title?: unknown;
      description?: unknown;
      priority?: unknown;
      category?: unknown;
      tags?: unknown;
      assignedTo?: unknown;
    } | null;

    const title = typeof data?.title === "string" ? data.title.trim() : "";
    const description = typeof data?.description === "string" ? data.description.trim() : "";

    if (title.length < 3 || description.length < 10) {
      return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
    }

    const now = new Date();
    const ticketCollection = adminDb.collection("tenants").doc(tenantId).collection("support_tickets");
    const counterRef = adminDb.collection("tenants").doc(tenantId).collection("support_meta").doc("ticket_counter");
    const newTicketRef = ticketCollection.doc();

    const result = await adminDb.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const lastNumber = counterSnap.exists ? Number(counterSnap.data()?.lastNumber || 0) : 0;
      const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
      const ticketNumber = `TKT-${String(nextNumber).padStart(4, "0")}`;

      const payload = {
        ticketNumber,
        title,
        description,
        status: "open" as TicketStatus,
        priority: parsePriority(data?.priority),
        category: parseCategory(data?.category),
        createdBy: {
          uid: current.uid,
          name: typeof current.name === "string" && current.name.trim() ? current.name.trim() : "Unknown",
          email: typeof current.email === "string" ? current.email : "",
        },
        assignedTo:
          data?.assignedTo && typeof data.assignedTo === "object" && data.assignedTo !== null
            ? {
                uid: String((data.assignedTo as { uid?: unknown }).uid || ""),
                name: String((data.assignedTo as { name?: unknown }).name || ""),
              }
            : null,
        tags: Array.isArray(data?.tags)
          ? data.tags
              .filter((tag): tag is string => typeof tag === "string")
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 10)
          : [],
        createdAt: now,
        updatedAt: now,
      };

      tx.set(counterRef, { lastNumber: nextNumber, updatedAt: now }, { merge: true });
      tx.set(newTicketRef, payload);

      return { id: newTicketRef.id, ...payload };
    });

    return NextResponse.json({
      ...result,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("SUPPORT_TICKETS_POST_ERROR", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
