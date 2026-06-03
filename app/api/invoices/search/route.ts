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

    return await handleModuleSearch(request, session as { uid: string; tenantId: string; role?: string | null }, {
      module: "invoices",
      collection: "invoices",
      searchFields: ["invoiceNumber", "customerName", "description"],
      defaultSortBy: "createdAt",
      csvFields: ["id", "invoiceNumber", "customerName", "status", "total", "createdAt", "updatedAt"],
    });
  } catch (error) {
    console.error("Error searching invoices:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
