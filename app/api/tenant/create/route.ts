import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createTenantWorkspace } from "@/lib/tenant/onboarding";
import { getCurrentUserOrThrow, isAdmin } from "@/lib/tenant/server";
import { createNotifications, getUsersByRoles } from "@/lib/notifications";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";

export const runtime = "nodejs";

const schema = z.object({
  tenantId: z.string().trim().min(3).max(100),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  plan: z.enum(["trial", "starter", "professional", "enterprise"]),
});

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserOrThrow(req);
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid request body." },
        { status: 400 }
      );
    }

    const role = String(currentUser.role || "").toLowerCase();
    if (role !== "super_admin" && currentUser.tenantId !== parsed.data.tenantId) {
      return NextResponse.json({ success: false, error: "Tenant mismatch" }, { status: 403 });
    }

    const result = await createTenantWorkspace({
      ...parsed.data,
      ownerId: currentUser.uid,
    });

    try {
      const platformAdmins = await getUsersByRoles(["super_admin"], DEFAULT_TENANT_ID);
      await createNotifications({
        recipients: platformAdmins,
        tenantId: DEFAULT_TENANT_ID,
        type: "info",
        title: "New tenant created",
        message: `${parsed.data.name} signed up on the ${parsed.data.plan} plan.`,
        entityType: "tenant",
        entityId: parsed.data.tenantId,
        deepLink: "/super_admin/tenants",
      });
    } catch (notifyError) {
      console.error("tenant.create platform notify error:", notifyError);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Session expired", "User not found"].includes(error.message)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "TENANT_ALREADY_EXISTS") {
      return NextResponse.json({ success: false, error: "Tenant already exists." }, { status: 409 });
    }

    console.error("Tenant create error:", error);
    return NextResponse.json({ success: false, error: "Unable to create tenant workspace." }, { status: 500 });
  }
}
