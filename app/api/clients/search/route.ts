import { type NextRequest, NextResponse } from "next/server";
import { handleModuleSearch } from "@/lib/search/module-search";
import { getCurrentUser } from "@/app/api/admin/_utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await handleModuleSearch(request, session, {
      module: "clients",
      collection: "clients",
      searchFields: ["name", "email", "company", "phone"],
      defaultSortBy: "createdAt",
      csvFields: ["id", "name", "email", "company", "phone", "status", "createdAt", "updatedAt"],
    });
  } catch (error) {
    console.error("Error searching clients:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
