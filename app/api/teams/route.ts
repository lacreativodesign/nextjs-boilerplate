import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { TeamService } from "@/lib/teams/team-service";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";

export const dynamic = "force-dynamic";

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["department", "project", "working_group", "custom"]),
  leaderId: z.string().optional(),
  parentTeamId: z.string().optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}){1,2}$/).optional(),
  avatar: z.string().url().optional(),
  isPrivate: z.boolean().optional(),
  allowMemberInvites: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

function canCreateTeam(role: string) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "super_admin" || normalized === "manager" || normalized === "owner";
}

export async function POST(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canCreateTeam(me.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = createTeamSchema.parse(body);

    const teamId = await TeamService.createTeam({
      tenantId: me.tenantId,
      createdBy: me.uid,
      ...data,
    });

    return NextResponse.json({ teamId });
  } catch (error: any) {
    console.error("Error creating team:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create team" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const query = adminDb
      .collection("teams")
      .where("tenantId", "==", me.tenantId)
      .where("archivedAt", "==", null);

    const snapshot = await query.get();
    const teams = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ teams });
  } catch (error) {
    console.error("Error fetching teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 }
    );
  }
}
