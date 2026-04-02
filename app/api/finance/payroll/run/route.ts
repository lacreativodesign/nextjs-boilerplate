import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createFinanceEvent, requireFinance, serverTimestamp } from "../../_utils";
import { createNotification, getUserIdsByRoles, getUsersByRoles } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/email-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const month = String(body?.month || "").trim();
    if (!month) {
      return NextResponse.json({ ok: false, error: "Month is required." }, { status: 400 });
    }

    const existingSnap = await adminDb.collection("payroll").where("isDeleted", "==", false).limit(500).get();
    const existingUserIds = new Set(
      existingSnap.docs
        .map((doc) => doc.data() || {})
        .filter((row) => String(row.month || "") === month)
        .map((row) => String(row.userId || ""))
    );

    const usersSnap = await adminDb.collection("users").get();
    const batch = adminDb.batch();
    let created = 0;

    usersSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const salary = Number(data.salary || 0);
      if (!salary || Number.isNaN(salary)) return;
      if (existingUserIds.has(doc.id)) return;

      const ref = adminDb.collection("payroll").doc();
      batch.set(ref, {
        userId: doc.id,
        userName: data.name || data.fullName || data.displayName || "",
        role: data.role || "",
        currency: "PKR",
        baseSalaryPkr: salary,
        commissionPkr: null,
        commissionUsd: null,
        month,
        status: "Draft",
        paidAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });
      created += 1;
    });

    if (created > 0) {
      await batch.commit();
    }

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const financeIds = await getUserIdsByRoles(["finance", "admin", "super_admin"], auth.user.tenantId || null);
    await Promise.all(
      financeIds.map((uid) =>
        createNotification({
          toUserId: uid,
          title: "Payroll run created",
          body: `Payroll run for ${month} created (${created} entries).`,
          type: "info",
          entityType: "payroll",
          entityId: null,
          deepLink: "/finance/payroll",
          createdBy: { uid: auth.user.uid, name: actorName },
          tenantId: auth.user.tenantId || null,
        })
      )
    );

    await createFinanceEvent({
      type: "finance.payroll_run",
      title: "Payroll run created",
      description: `Payroll run for ${month} created (${created} entries).`,
      entityType: "payroll",
      entityId: null,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      tenantId: auth.user.tenantId,
    });

    // Email finance + admin about payroll run — non-blocking
    getUsersByRoles(["finance", "admin"], auth.user.tenantId || "").then((recipients) => {
      return Promise.all(recipients.map((recipient) =>
        sendEmail({
          to: recipient.email || "",
          subject: `💰 Payroll run created — ${month}`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Finance Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#012167;">💰 Payroll Run Created</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A new payroll run has been created and is ready for review.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Month</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${month}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Entries created</td><td style="font-weight:700;color:#012167;text-align:right;border-bottom:1px solid #F1F5F9;">${created}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Run by</td><td style="font-weight:600;color:#1E293B;text-align:right;">${actorName || "Finance"}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/finance/payroll" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Review Payroll →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto ERP · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
        }).catch(() => {})
      ));
    }).catch((err) => console.error("[PAYROLL_RUN] Failed to email finance", err));

    return NextResponse.json({ ok: true, created });
  } catch (err: any) {
    console.error("finance/payroll run error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to run payroll.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
