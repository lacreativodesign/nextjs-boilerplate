import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { ProjectService } from "@/lib/projects/project-service";
import { getCurrentUser } from "@/app/api/admin/_utils";

export const dynamic = "force-dynamic";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  clientId: z.string().optional(),
  clientName: z.string().max(200).optional(),
  category: z.enum(["internal", "client_project", "product_development", "marketing", "sales", "operations", "other"]),
  budget: z.number().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  teamMemberIds: z.array(z.string()).default([]),
  billable: z.boolean(),
});

const managerRoles = new Set(["admin", "owner", "manager", "super_admin", "am_manager", "production_manager"]);

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!managerRoles.has(String(me.role || "").toLowerCase())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = createProjectSchema.parse(body);
    const code = await ProjectService.generateProjectCode(me.tenantId);

    const projectId = await ProjectService.createProject({
      tenantId: me.tenantId,
      code,
      name: data.name,
      description: data.description,
      clientId: data.clientId,
      clientName: data.clientName,
      category: data.category,
      budget: data.budget,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      managerId: me.uid,
      managerName: me.name || me.fullName || "",
      teamMemberIds: data.teamMemberIds,
      billable: data.billable,
    });

    return NextResponse.json({ projectId });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create project" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const clientId = searchParams.get("clientId");

    let query: FirebaseFirestore.Query = adminDb.collection("projects").where("tenantId", "==", me.tenantId);

    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }

    if (clientId) {
      query = query.where("clientId", "==", clientId);
    }

    if (!managerRoles.has(String(me.role || "").toLowerCase())) {
      query = query.where("teamMemberIds", "array-contains", me.uid);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    const projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
