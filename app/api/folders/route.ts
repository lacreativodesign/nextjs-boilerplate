import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { FileManager } from "@/lib/files/file-manager";

export const runtime = "nodejs";

const createFolderSchema = z.object({
  name: z.string().min(1).max(100),
  parentFolderId: z.string().optional(),
  visibility: z.enum(["private", "team", "public"]).default("private"),
  allowedRoles: z.array(z.string().min(1)).optional(),
  allowedUsers: z.array(z.string().min(1)).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = createFolderSchema.parse(await request.json());
    const folder = await FileManager.createFolder({
      tenantId: session.tenantId,
      name: body.name,
      parentFolderId: body.parentFolderId,
      createdBy: session.uid,
      permissions: {
        visibility: body.visibility,
        allowedRoles: body.allowedRoles ?? [],
        allowedUsers: body.allowedUsers ?? [],
      },
    });

    return NextResponse.json({ folder });
  } catch (error: any) {
    console.error("Error creating folder:", error);
    return NextResponse.json({ error: error?.message || "Failed to create folder" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parentFolderId = searchParams.get("parentFolderId") || undefined;

    const folders = await FileManager.listFolders(session.tenantId, parentFolderId);

    return NextResponse.json({ folders });
  } catch (error: any) {
    console.error("Error fetching folders:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch folders" }, { status: 500 });
  }
}
