import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { ProjectService } from "@/lib/projects/project-service";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logging";
import { executeMonitoredQuery, getPageSize } from "@/lib/firestore/query-performance";

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
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    if (!managerRoles.has(String(me.role || "").toLowerCase())) {
      throw new AppError({ message: "Forbidden", code: "FORBIDDEN", status: 403 });
    }

    const body = await request.json();
    const validated = createProjectSchema.safeParse(body);

    if (!validated.success) {
      throw new AppError({
        message: "Project details are invalid.",
        code: "VALIDATION_ERROR",
        status: 400,
        details: validated.error.flatten(),
      });
    }

    const code = await ProjectService.generateProjectCode(me.tenantId as string);

    const projectId = await ProjectService.createProject({
      tenantId: me.tenantId,
      code,
      name: validated.data.name,
      description: validated.data.description,
      clientId: validated.data.clientId,
      clientName: validated.data.clientName,
      category: validated.data.category,
      budget: validated.data.budget,
      startDate: new Date(validated.data.startDate),
      endDate: validated.data.endDate ? new Date(validated.data.endDate) : undefined,
      managerId: me.uid,
      managerName: me.name || me.fullName || "",
      teamMemberIds: validated.data.teamMemberIds,
      billable: validated.data.billable,
    });

    return NextResponse.json({ projectId });
  } catch (error) {
    logError(error, { route: "POST /api/projects" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to create project.",
      context: { module: "projects", operation: "create-project" },
    });
    return NextResponse.json(body, { status, headers });
  }
}

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) {
      throw new AppError({ message: "Unauthorized", code: "UNAUTHORIZED", status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const clientId = searchParams.get("clientId");
    const cursor = searchParams.get("cursor");
    const pageSize = getPageSize(searchParams.get("limit"));

    let query: FirebaseFirestore.Query = adminDb.collection("projects").where("tenantId", "==", me.tenantId);

    if (status && status !== "all") query = query.where("status", "==", status);
    if (clientId) query = query.where("clientId", "==", clientId);
    if (!managerRoles.has(String(me.role || "").toLowerCase())) {
      query = query.where("teamMemberIds", "array-contains", me.uid);
    }

    query = query.orderBy("createdAt", "desc").limit(pageSize);

    if (cursor) {
      const cursorDoc = await adminDb.collection("projects").doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await executeMonitoredQuery(() => query.get(), {
      route: "GET /api/projects",
      tenantId: me.tenantId,
      queryName: "projects_list",
      metadata: { status, clientId, limit: pageSize, cursor: cursor || null },
    });
    const projects = snapshot.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      projects,
      pagination: {
        limit: pageSize,
        nextCursor: snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null,
      },
    });
  } catch (error) {
    logError(error, { route: "GET /api/projects" });
    const { status, body, headers } = resolveErrorResponse(error, {
      fallbackMessage: "Unable to load projects.",
      context: { module: "projects", operation: "list-projects" },
    });
    return NextResponse.json(body, { status, headers });
  }
}
