import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdminOrSuper } from "@/app/api/admin/_utils";
import { SearchService } from "@/lib/search/search-service";
import { searchSchema, validateFilters, validateSortField } from "@/lib/search/search-api";
import type { Document } from "@/types/documents";
import type { SearchFilter } from "@/types/search";

export const runtime = "nodejs";

function hasDocumentAccess(document: Document, user: { uid: string; role: string }) {
  if (document.visibility === "public" || document.visibility === "team") {
    return true;
  }
  if (document.uploadedBy === user.uid) {
    return true;
  }
  if (document.sharedWith?.includes(user.uid)) {
    return true;
  }
  if (document.allowedRoles?.includes(user.role)) {
    return true;
  }
  return isAdminOrSuper(user.role);
}

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const params = searchSchema.parse(body);

  const filterValidationError = validateFilters(params.filters as SearchFilter[] | undefined);
  if (filterValidationError) {
    return NextResponse.json({ error: filterValidationError }, { status: 400 });
  }

  const sortValidationError = validateSortField(params.sortBy, ["createdAt", "updatedAt", "originalFileName", "category"]);
  if (sortValidationError) {
    return NextResponse.json({ error: sortValidationError }, { status: 400 });
  }

  const offset = (params.page - 1) * params.limit;

  let results: Document[] = [];

  if (params.searchText) {
    const scanLimit = Math.min(params.page * params.limit * 5, 500);
    const rawResults = await SearchService.fullTextSearch({
      collection: "documents",
      tenantId: session.tenantId,
      searchText: params.searchText,
      searchFields: ["fileName", "originalFileName", "title", "description"],
      limit: scanLimit,
    });

    results = rawResults as Document[];
  } else if (params.filters && params.filters.length > 0) {
    const searchResult = await SearchService.search({
      collection: "documents",
      tenantId: session.tenantId,
      filters: params.filters as SearchFilter[],
      sortBy: params.sortBy || "createdAt",
      sortOrder: params.sortOrder,
      limit: Math.min(params.limit * 5, 200),
      offset: 0,
    });

    results = searchResult.results as Document[];
  } else {
    const snapshot = await SearchService.buildQuery("documents", session.tenantId as string, [], params.sortBy || "createdAt", params.sortOrder)
      .limit(Math.min(params.limit * 5, 200))
      .get();

    results = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) } as Document));
  }

  const filtered = results.filter((doc) => !doc.deletedAt).filter((doc) => hasDocumentAccess(doc, session));
  const total = filtered.length;
  const paged = filtered.slice(offset, offset + params.limit);

  return NextResponse.json({
    results: paged,
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    },
  });
}
