import { NextRequest, NextResponse } from "next/server";
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
      module: "products",
      collection: "products",
      searchFields: ["name", "sku", "description", "category"],
      defaultSortBy: "createdAt",
      csvFields: ["id", "name", "sku", "category", "price", "createdAt", "updatedAt"],
    });
  } catch (error) {
    console.error("Error searching products:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
