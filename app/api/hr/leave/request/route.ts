import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { isPlanAccessError, requireModule } from "@/app/lib/plan-enforcement";
import { LeaveService } from "@/lib/hr/leave";
import { dispatchWebhookEvent } from "@/lib/webhooks/webhook-delivery";
import { sendEmail } from "@/lib/email/email-service";
import { getUsersByRoles } from "@/lib/notifications";

export const runtime = "nodejs";

const schema = z.object({
  leaveType: z.enum(["vacation", "sick", "personal", "unpaid", "bereavement"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(1000).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
      await requireModule(me.tenantId, "hr", { role: me.role });
    } catch (err) {
      if (isPlanAccessError(err)) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      }
      return NextResponse.json({ ok: false, error: "Unable to validate module access" }, { status: 500 });
    }

    const payload = schema.parse(await request.json());

    const leaveRequest = await LeaveService.submitLeaveRequest({
      tenantId: me.tenantId,
      employeeId: me.uid,
      employeeName: me.name || me.fullName || me.email || me.uid,
      leaveType: payload.leaveType,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      reason: payload.reason || null,
    });

    try {
      await dispatchWebhookEvent({
        tenantId: me.tenantId,
        event: "leave.requested",
        entityType: "leave",
        entityId: leaveRequest.id,
        payload: {
          requestId: leaveRequest.id,
          leaveType: payload.leaveType,
          employeeId: me.uid,
          startDate: payload.startDate,
          endDate: payload.endDate,
        },
        actor: { uid: me.uid, email: me.email || null, role: me.role || null },
      });
    } catch (webhookError) {
      console.error("leave.requested webhook dispatch error:", webhookError);
    }

    // Email HR + admin about leave request — non-blocking
    getUsersByRoles(["hr", "admin"], me.tenantId).then((hrTeam) => {
      const startFormatted = new Date(payload.startDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const endFormatted = new Date(payload.endDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      return Promise.all(hrTeam.map((member) =>
        sendEmail({
          to: member.email || "",
          subject: `🏖️ Leave request — ${me.name || me.email || "Employee"}`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">HR Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#012167;">🏖️ Leave Request Submitted</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">An employee has submitted a leave request for your review.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Employee</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${me.name || me.fullName || me.email || "—"}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Leave Type</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${payload.leaveType}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">From</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${startFormatted}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">To</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${endFormatted}</td></tr>
${payload.reason ? `<tr><td style="color:#64748B;font-size:13px;">Reason</td><td style="font-weight:600;color:#1E293B;text-align:right;">${payload.reason}</td></tr>` : ""}
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/hr/leave" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Review Leave Request →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto ERP · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
        }).catch(() => {})
      ));
    }).catch((err) => console.error("[LEAVE_REQUEST] Failed to email HR", err));

    return NextResponse.json({ ok: true, requestId: leaveRequest.id });
  } catch (err) {
    console.error("HR leave request error", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to submit leave request" }, { status: 400 });
  }
}
