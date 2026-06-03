import { NextResponse } from "next/server";
import { getCurrentUser, isAdminRole } from "@/app/api/admin/_utils";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketCategory = "bug" | "feature" | "question" | "billing";

type AiAnalysis = {
  category: TicketCategory;
  priority: TicketPriority;
  summary: string;
  suggestedFix: string;
  isAutoFixable: boolean;
  manualWorkRequired: string | null;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
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

async function classifyWithAI(
  title: string,
  description: string,
  pageUrl: string,
  tenantId: string,
): Promise<AiAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are a SaaS support AI for Bizosto ERP. Analyze this bug report and respond ONLY with a JSON object, no markdown, no explanation.

Title: ${title}
Description: ${description}
Page URL: ${pageUrl}
Tenant: ${tenantId}

Respond with exactly this JSON structure:
{
  "category": "bug" | "feature" | "question" | "billing",
  "priority": "low" | "medium" | "high" | "urgent",
  "summary": "one sentence summary of the issue",
  "suggestedFix": "specific actionable fix suggestion in 1-2 sentences",
  "isAutoFixable": false,
  "manualWorkRequired": "what the super admin needs to do manually, or null if not needed"
}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as AiAnalysis;
  } catch {
    return null;
  }
}

async function notifySuperAdmin(
  ticket: {
    ticketNumber: string;
    title: string;
    description: string;
    pageUrl: string;
    tenantId: string;
    reporterName: string | null;
    reporterEmail: string | null;
    hasScreenshot: boolean;
  },
  ai: AiAnalysis | null,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const from = process.env.ONBOARDING_FROM_EMAIL || "Bizosto <welcome@bizosto.com>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.bizosto.com";
  const superAdminEmail = "admin@bizosto.com";

  const resend = new Resend(apiKey);

  const priorityColor: Record<string, string> = {
    urgent: "#dc2626",
    high: "#ea580c",
    medium: "#d97706",
    low: "#16a34a",
  };

  const pColor = priorityColor[ai?.priority || "medium"] || "#d97706";

  const aiSection = ai
    ? `
      <div style="background:#f0f4ff;border-left:4px solid #012167;padding:16px;border-radius:0 8px 8px 0;margin:20px 0">
        <p style="font-weight:700;margin:0 0 8px;color:#012167">🤖 AI Analysis</p>
        <p style="margin:0 0 6px"><strong>Summary:</strong> ${ai.summary}</p>
        <p style="margin:0 0 6px"><strong>Suggested Fix:</strong> ${ai.suggestedFix}</p>
        ${ai.manualWorkRequired ? `<p style="margin:0;color:#dc2626"><strong>⚠ Manual Action Required:</strong> ${ai.manualWorkRequired}</p>` : '<p style="margin:0;color:#16a34a"><strong>✓ No manual action required</strong></p>'}
      </div>`
    : "";

  await resend.emails.send({
    from,
    to: superAdminEmail,
    subject: `[${ticket.ticketNumber}] Bug Report — ${ticket.title.slice(0, 60)}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb">
        <div style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px;color:#fff;font-size:20px;font-weight:700;letter-spacing:0.08em">BIZOSTO</div>
        <div style="padding:32px 24px;background:#fff;color:#111827;line-height:1.6">
          <p style="font-size:16px;font-weight:700;margin:0 0 4px">New Bug Report Submitted</p>
          <p style="margin:0 0 20px;color:#6b7280;font-size:14px">A user has reported an issue that needs your attention.</p>

          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;width:140px">Ticket</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600">${ticket.ticketNumber}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Tenant</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600">${ticket.tenantId}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Reporter</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px">${ticket.reporterName || "Anonymous"}${ticket.reporterEmail ? ` &lt;${ticket.reporterEmail}&gt;` : ""}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Priority</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:700;color:${pColor}">${(ai?.priority || "medium").toUpperCase()}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">Page</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px">${ticket.pageUrl || "Not provided"}</td></tr>
            <tr><td style="padding:10px 0;font-size:14px;color:#6b7280">Screenshot</td><td style="padding:10px 0;font-size:14px">${ticket.hasScreenshot ? "✓ Attached in ticket" : "None"}</td></tr>
          </table>

          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="font-weight:600;margin:0 0 8px">${ticket.title}</p>
            <p style="margin:0;font-size:14px;color:#374151;white-space:pre-wrap">${ticket.description}</p>
          </div>

          ${aiSection}

          <p style="margin:24px 0 0">
            <a href="${appUrl}/admin/support" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Ticket →</a>
          </p>
        </div>
      </div>`,
  });
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
    const data = await req.json().catch(() => null) as Record<string, unknown> | null;

    const title = typeof data?.title === "string" ? data.title.trim() : "";
    const description = typeof data?.description === "string" ? data.description.trim() : "";
    const pageUrl = typeof data?.pageUrl === "string" ? data.pageUrl.trim() : "";
    const reporterName = typeof data?.reporterName === "string" ? data.reporterName.trim() : null;
    const reporterEmail = typeof data?.reporterEmail === "string" ? data.reporterEmail.trim() : null;
    const screenshot = typeof data?.screenshot === "string" ? data.screenshot : null;
    const screenshotName = typeof data?.screenshotName === "string" ? data.screenshotName : null;

    if (title.length < 3 || description.length < 10) {
      return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
    }

    // Run AI classification in parallel with ticket creation prep
    const aiPromise = classifyWithAI(title, description, pageUrl, tenantId);

    const now = new Date();
    const ticketCollection = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("support_tickets");
    const counterRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("support_meta")
      .doc("ticket_counter");
    const newTicketRef = ticketCollection.doc();

    const ai = await aiPromise;

    const result = await adminDb.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const lastNumber = counterSnap.exists ? Number(counterSnap.data()?.lastNumber || 0) : 0;
      const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
      const ticketNumber = `TKT-${String(nextNumber).padStart(4, "0")}`;

      const payload = {
        ticketNumber,
        title,
        description,
        pageUrl: pageUrl || null,
        reporterName: reporterName || null,
        reporterEmail: reporterEmail || null,
        screenshot: screenshot || null,
        screenshotName: screenshotName || null,
        hasScreenshot: Boolean(screenshot),
        status: "open" as TicketStatus,
        priority: ai?.priority || parsePriority(data?.priority),
        category: ai?.category || parseCategory(data?.category),
        tags: Array.isArray(data?.tags)
          ? (data.tags as unknown[])
              .filter((tag): tag is string => typeof tag === "string")
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 10)
          : [],
        aiAnalysis: ai || null,
        createdBy: {
          uid: current.uid,
          name: typeof current.name === "string" && current.name.trim() ? current.name.trim() : "Unknown",
          email: typeof current.email === "string" ? current.email : "",
        },
        assignedTo: null,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(counterRef, { lastNumber: nextNumber, updatedAt: now }, { merge: true });
      tx.set(newTicketRef, payload);

      return { id: newTicketRef.id, ...payload };
    });

    // Notify super admin — non-blocking
    notifySuperAdmin(
      {
        ticketNumber: result.ticketNumber,
        title,
        description,
        pageUrl,
        tenantId,
        reporterName,
        reporterEmail,
        hasScreenshot: Boolean(screenshot),
      },
      ai,
    ).catch((err) => console.error("SUPPORT_NOTIFY_SUPER_ADMIN_ERROR", err));

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
