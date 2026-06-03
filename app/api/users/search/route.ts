import { NextRequest, NextResponse } from "next/server";
import { handleModuleSearch } from "@/lib/search/module-search";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminOrSuper(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return await handleModuleSearch(request, session as { uid: string; tenantId: string; role?: string | null }, {
      module: "users",
      collection: "users",
      searchFields: ["name", "email", "role", "title"],
      defaultSortBy: "createdAt",
      csvFields: ["id", "name", "email", "role", "status", "createdAt", "updatedAt"],
    });
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
