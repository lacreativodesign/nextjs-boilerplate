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
      module: "payments",
      collection: "payments",
      searchFields: ["paymentReference", "customerName", "status", "method"],
      defaultSortBy: "createdAt",
      csvFields: ["id", "paymentReference", "customerName", "status", "amount", "createdAt", "updatedAt"],
    });
  } catch (error) {
    console.error("Error searching payments:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
