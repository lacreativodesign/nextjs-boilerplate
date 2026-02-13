import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { FILTER_TEMPLATES } from '@/lib/search/filter-templates';

export { FILTER_TEMPLATES };

export type AdvancedFilterOperator =
  | 'equals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'in'
  | 'notEquals'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual';

export type AdvancedFilterValue = string | number | boolean | null | Array<string | number>;

export interface AdvancedSearchFilter {
  field: string;
  operator: AdvancedFilterOperator;
  value: AdvancedFilterValue;
}

export interface AdvancedSearchRequest {
  tenantId: string;
  uid: string;
  collection: string;
  query?: string;
  searchFields?: string[];
  filters?: AdvancedSearchFilter[];
  logic?: 'AND' | 'OR';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface AdvancedSearchResult {
  id: string;
  [key: string]: unknown;
}

export interface SavedAdvancedSearch {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  collection: string;
  query: string;
  searchFields: string[];
  filters: AdvancedSearchFilter[];
  logic: 'AND' | 'OR';
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  collection: string;
  resultsCount: number;
  timestamp: string | null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in (value as Record<string, unknown>)) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') {
      const result = fn();
      return result instanceof Date && !Number.isNaN(result.getTime()) ? result : null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeComparable(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  const asDate = toDate(value);
  if (asDate) return asDate.getTime();
  return String(value);
}

function normalizeArray(value: AdvancedFilterValue): Array<string | number> {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'number' ? item : String(item).trim()))
      .filter((item) => item !== '');
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const asNumber = Number(item);
        return Number.isNaN(asNumber) ? item : asNumber;
      });
  }
  if (typeof value === 'number') return [value];
  return [];
}

function matchesFilter(item: Record<string, unknown>, filter: AdvancedSearchFilter): boolean {
  const current = normalizeComparable(item[filter.field]);

  switch (filter.operator) {
    case 'equals':
      return current === normalizeComparable(filter.value);
    case 'notEquals':
      return current !== normalizeComparable(filter.value);
    case 'contains': {
      const source = String(current ?? '').toLowerCase();
      const target = String(filter.value ?? '').toLowerCase();
      return target ? source.includes(target) : true;
    }
    case 'greaterThan': {
      const c = normalizeComparable(current);
      const v = normalizeComparable(filter.value);
      return typeof c === 'number' && typeof v === 'number'
        ? c > v
        : String(c ?? '') > String(v ?? '');
    }
    case 'lessThan': {
      const c = normalizeComparable(current);
      const v = normalizeComparable(filter.value);
      return typeof c === 'number' && typeof v === 'number'
        ? c < v
        : String(c ?? '') < String(v ?? '');
    }
    case 'greaterThanOrEqual': {
      const c = normalizeComparable(current);
      const v = normalizeComparable(filter.value);
      return typeof c === 'number' && typeof v === 'number'
        ? c >= v
        : String(c ?? '') >= String(v ?? '');
    }
    case 'lessThanOrEqual': {
      const c = normalizeComparable(current);
      const v = normalizeComparable(filter.value);
      return typeof c === 'number' && typeof v === 'number'
        ? c <= v
        : String(c ?? '') <= String(v ?? '');
    }
    case 'between': {
      const values = normalizeArray(filter.value);
      if (values.length < 2) return false;
      const [min, max] = values;
      const c = normalizeComparable(current);
      if (typeof c === 'number' && typeof min === 'number' && typeof max === 'number') {
        return c >= min && c <= max;
      }
      const text = String(c ?? '');
      return text >= String(min) && text <= String(max);
    }
    case 'in': {
      const values = normalizeArray(filter.value);
      return values.some((value) => value === current || String(value) === String(current ?? ''));
    }
    default:
      return true;
  }
}

function matchesQuery(
  item: Record<string, unknown>,
  query: string,
  searchFields: string[],
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return searchFields.some((field) => {
    const value = item[field];
    if (value == null) return false;
    return String(value).toLowerCase().includes(normalized);
  });
}

function toIso(value: unknown): string | null {
  const asDate = toDate(value);
  return asDate ? asDate.toISOString() : null;
}

export async function runAdvancedSearch(
  params: AdvancedSearchRequest,
): Promise<{ results: AdvancedSearchResult[]; total: number }> {
  const {
    tenantId,
    uid,
    collection,
    query = '',
    searchFields = [],
    filters = [],
    logic = 'AND',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    limit = 100,
  } = params;

  let baseQuery: FirebaseFirestore.Query = adminDb
    .collection(collection)
    .where('tenantId', '==', tenantId);
  if (sortBy) {
    baseQuery = baseQuery.orderBy(sortBy, sortOrder);
  }

  const snapshot = await baseQuery.limit(Math.min(Math.max(limit * 3, 100), 500)).get();
  const rows = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));

  const filtered = rows.filter((item) => {
    const queryOk = matchesQuery(item, query, searchFields);
    if (!queryOk) return false;
    if (filters.length === 0) return true;
    const outcomes = filters.map((filter) => matchesFilter(item, filter));
    return logic === 'OR' ? outcomes.some(Boolean) : outcomes.every(Boolean);
  });

  const results = filtered.slice(0, limit);

  await adminDb.collection('searchHistory').add({
    tenantId,
    uid,
    query,
    collection,
    searchFields,
    filters,
    logic,
    resultsCount: filtered.length,
    timestamp: Timestamp.now(),
  });

  await adminDb.collection('searchAnalytics').add({
    tenantId,
    uid,
    query,
    collection,
    logic,
    filtersCount: filters.length,
    resultsCount: filtered.length,
    createdAt: Timestamp.now(),
  });

  return { results, total: filtered.length };
}

export async function saveAdvancedSearch(params: {
  tenantId: string;
  uid: string;
  name: string;
  collection: string;
  query: string;
  searchFields: string[];
  filters: AdvancedSearchFilter[];
  logic: 'AND' | 'OR';
}) {
  const payload = {
    tenantId: params.tenantId,
    userId: params.uid,
    name: params.name,
    collection: params.collection,
    query: params.query,
    searchFields: params.searchFields,
    filters: params.filters,
    logic: params.logic,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const doc = await adminDb.collection('savedAdvancedSearches').add(payload);
  return { id: doc.id, ...payload };
}

export async function listSavedAdvancedSearches(params: {
  tenantId: string;
  uid: string;
}): Promise<SavedAdvancedSearch[]> {
  const snapshot = await adminDb
    .collection('savedAdvancedSearches')
    .where('tenantId', '==', params.tenantId)
    .where('userId', '==', params.uid)
    .orderBy('updatedAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const row = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      tenantId: String(row.tenantId || ''),
      userId: String(row.userId || ''),
      name: String(row.name || ''),
      collection: String(row.collection || ''),
      query: String(row.query || ''),
      searchFields: Array.isArray(row.searchFields)
        ? row.searchFields.map((field) => String(field))
        : [],
      filters: Array.isArray(row.filters) ? (row.filters as AdvancedSearchFilter[]) : [],
      logic: row.logic === 'OR' ? 'OR' : 'AND',
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  });
}

export async function deleteSavedAdvancedSearch(params: {
  tenantId: string;
  uid: string;
  id: string;
}) {
  const ref = adminDb.collection('savedAdvancedSearches').doc(params.id);
  const doc = await ref.get();
  if (!doc.exists) {
    return false;
  }

  const row = doc.data() as { tenantId?: string; userId?: string };
  if (row.tenantId !== params.tenantId || row.userId !== params.uid) {
    throw new Error('Forbidden');
  }

  await ref.delete();
  return true;
}

export async function getSearchHistory(params: {
  tenantId: string;
  uid: string;
  limit?: number;
}): Promise<SearchHistoryItem[]> {
  const snapshot = await adminDb
    .collection('searchHistory')
    .where('tenantId', '==', params.tenantId)
    .where('uid', '==', params.uid)
    .orderBy('timestamp', 'desc')
    .limit(params.limit ?? 20)
    .get();

  return snapshot.docs.map((doc) => {
    const row = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      query: String(row.query || ''),
      collection: String(row.collection || ''),
      resultsCount: Number(row.resultsCount || 0),
      timestamp: toIso(row.timestamp),
    };
  });
}

export async function getSearchSuggestions(params: {
  tenantId: string;
  uid: string;
  q: string;
  limit?: number;
}) {
  const q = params.q.trim().toLowerCase();
  if (!q) return [] as string[];

  const [history, saved] = await Promise.all([
    adminDb
      .collection('searchHistory')
      .where('tenantId', '==', params.tenantId)
      .where('uid', '==', params.uid)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get(),
    adminDb
      .collection('savedAdvancedSearches')
      .where('tenantId', '==', params.tenantId)
      .where('userId', '==', params.uid)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get(),
  ]);

  const candidates = new Set<string>();

  for (const doc of history.docs) {
    const query = String(doc.data().query || '').trim();
    if (query && query.toLowerCase().includes(q)) {
      candidates.add(query);
    }
  }

  for (const doc of saved.docs) {
    const row = doc.data();
    const name = String(row.name || '').trim();
    const query = String(row.query || '').trim();
    if (name && name.toLowerCase().includes(q)) {
      candidates.add(name);
    }
    if (query && query.toLowerCase().includes(q)) {
      candidates.add(query);
    }
  }

  return Array.from(candidates).slice(0, params.limit ?? 8);
}

export async function getSearchAnalytics(params: { tenantId: string; limit?: number }) {
  const snapshot = await adminDb
    .collection('searchAnalytics')
    .where('tenantId', '==', params.tenantId)
    .orderBy('createdAt', 'desc')
    .limit(params.limit ?? 200)
    .get();

  const aggregate = new Map<string, { query: string; count: number; totalResults: number }>();

  for (const doc of snapshot.docs) {
    const row = doc.data() as Record<string, unknown>;
    const query = String(row.query || '').trim();
    if (!query) continue;
    const current = aggregate.get(query) || { query, count: 0, totalResults: 0 };
    current.count += 1;
    current.totalResults += Number(row.resultsCount || 0);
    aggregate.set(query, current);
  }

  return Array.from(aggregate.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((item) => ({
      ...item,
      avgResults: item.count > 0 ? Number((item.totalResults / item.count).toFixed(2)) : 0,
    }));
}
