import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { SearchService } from "@/lib/search/search-service";
import {
  csvResponse,
  searchSchema,
  toCsv,
  validateFilters,
  validateSortField,
  type SearchModuleConfig,
} from "@/lib/search/search-api";
import type { SearchFilter } from "@/types/search";
import { CACHE_TTL_SECONDS, cacheKeys, rememberCached } from "@/lib/cache/redis-client";

export type SearchSession = {
  uid: string;
  tenantId: string;
  role?: string | null;
};

export async function handleModuleSearch(
  request: NextRequest,
  session: SearchSession,
  config: SearchModuleConfig
) {
  const body = await request.json();
  const params = searchSchema.parse(body);

  const filterValidationError = validateFilters(params.filters as SearchFilter[] | undefined);
  if (filterValidationError) {
    return NextResponse.json({ error: filterValidationError }, { status: 400 });
  }

  const sortValidationError = validateSortField(params.sortBy, config.allowedSortFields);
  if (sortValidationError) {
    return NextResponse.json({ error: sortValidationError }, { status: 400 });
  }

  const offset = (params.page - 1) * params.limit;

  const cachePayload = {
    module: config.module,
    tenantId: session.tenantId,
    searchText: params.searchText || "",
    filters: params.filters || [],
    sortBy: params.sortBy || config.defaultSortBy || "",
    sortOrder: params.sortOrder || "",
    page: params.page,
    limit: params.limit,
    format: params.format || "json",
  };
  const searchHash = crypto.createHash("sha256").update(JSON.stringify(cachePayload)).digest("hex").slice(0, 20);

  let results: Array<Record<string, unknown>> = [];
  let total = 0;

  if (params.searchText) {
    const scanLimit = Math.min(params.page * params.limit, 500);
    results = await SearchService.fullTextSearch({
      collection: config.collection,
      tenantId: session.tenantId,
      searchText: params.searchText,
      searchFields: config.searchFields,
      limit: scanLimit,
    });

    if (params.filters && params.filters.length > 0) {
      results = SearchService.filterResults(results, params.filters as SearchFilter[]);
    }

    total = results.length;
    results = results.slice(offset, offset + params.limit);
  } else if (params.filters && params.filters.length > 0) {
    const searchResult = await SearchService.search({
      collection: config.collection,
      tenantId: session.tenantId,
      filters: params.filters as SearchFilter[],
      sortBy: params.sortBy || config.defaultSortBy,
      sortOrder: params.sortOrder,
      limit: params.limit,
      offset,
    });
    results = searchResult.results as Array<Record<string, unknown>>;
    total = searchResult.total;
  } else {
    const query = await SearchService.buildQuery(
      config.collection,
      session.tenantId,
      [],
      params.sortBy || config.defaultSortBy || "createdAt",
      params.sortOrder || "desc"
    )
      .limit(params.limit)
      .offset(offset)
      .get();

    results = query.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    total = results.length;
  }

  if (params.format === "csv") {
    const csvPayload = toCsv(results, config.csvFields);
    return csvResponse(csvPayload, `${config.module}-search.csv`);
  }

  const responsePayload = {
    results,
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    },
  };

  if (params.format === "json" || !params.format) {
    const key = cacheKeys.searchResults(session.tenantId, config.module, searchHash);
    const cachedPayload = await rememberCached(key, CACHE_TTL_SECONDS.searchResults, async () => responsePayload, [
      `tenant:${session.tenantId}:search`,
      `tenant:${session.tenantId}:search:${config.module}`,
    ]);
    return NextResponse.json(cachedPayload);
  }

  return NextResponse.json(responsePayload);
}
