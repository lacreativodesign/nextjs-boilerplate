import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';

export type GlobalSearchModule =
  | 'users'
  | 'customers'
  | 'projects'
  | 'invoices'
  | 'documents'
  | 'payments'
  | 'expenses'
  | 'inventory'
  | 'search_index';

export type GlobalSearchFilters = {
  module?: GlobalSearchModule | 'all';
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type GlobalSearchResult = {
  id: string;
  module: GlobalSearchModule;
  title: string;
  subtitle: string;
  status?: string;
  date?: string;
  href: string;
  score: number;
  highlights: string[];
};

type ModuleConfig = {
  module: GlobalSearchModule;
  collection: string;
  titleFields: string[];
  subtitleFields: string[];
  statusField?: string;
  dateField?: string;
  hrefBuilder: (id: string, row: Record<string, unknown>) => string;
};

const MODULE_CONFIGS: ModuleConfig[] = [
  {
    module: 'users',
    collection: 'users',
    titleFields: ['name', 'displayName', 'email'],
    subtitleFields: ['email', 'role', 'department'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/admin/users?selected=${id}`,
  },
  {
    module: 'customers',
    collection: 'customers',
    titleFields: ['name', 'company', 'email'],
    subtitleFields: ['email', 'phone', 'company'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/admin/customers?selected=${id}`,
  },
  {
    module: 'projects',
    collection: 'projects',
    titleFields: ['name', 'title', 'projectName'],
    subtitleFields: ['clientName', 'ownerName', 'description'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/am/projects?selected=${id}`,
  },
  {
    module: 'invoices',
    collection: 'invoices',
    titleFields: ['invoiceNumber', 'number', 'customerName'],
    subtitleFields: ['customerName', 'status', 'notes'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/admin/finance/invoices?selected=${id}`,
  },
  {
    module: 'documents',
    collection: 'documents',
    titleFields: ['name', 'fileName', 'title'],
    subtitleFields: ['category', 'description', 'ownerName'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/am/files?selected=${id}`,
  },
  {
    module: 'payments',
    collection: 'payments',
    titleFields: ['reference', 'invoiceNumber', 'customerName'],
    subtitleFields: ['status', 'method', 'customerName'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/admin/finance/payments?selected=${id}`,
  },
  {
    module: 'expenses',
    collection: 'expenses',
    titleFields: ['title', 'vendor', 'description'],
    subtitleFields: ['vendor', 'category', 'status'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/admin/finance/expenses?selected=${id}`,
  },
  {
    module: 'inventory',
    collection: 'products',
    titleFields: ['name', 'sku'],
    subtitleFields: ['sku', 'category', 'description'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (id) => `/admin/inventory/products?selected=${id}`,
  },
  {
    module: 'search_index',
    collection: 'searchIndex',
    titleFields: ['title', 'name'],
    subtitleFields: ['content', 'module', 'status'],
    statusField: 'status',
    dateField: 'createdAt',
    hrefBuilder: (_id, row) => (typeof row.href === 'string' ? row.href : '/'),
  },
];

const MAX_PER_MODULE_SCAN = 80;

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function extractFirst(row: Record<string, unknown>, fields: string[]): string {
  for (const field of fields) {
    const value = asString(row[field]);
    if (value) return value;
  }
  return '';
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && value && 'toDate' in (value as Record<string, unknown>)) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') return fn();
  }
  return null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function fuzzyTokenScore(queryTokens: string[], haystackTokens: string[]) {
  if (queryTokens.length === 0) return 0;
  let total = 0;
  for (const q of queryTokens) {
    let best = 0;
    for (const h of haystackTokens) {
      if (!h) continue;
      if (h.includes(q)) {
        best = Math.max(best, 1);
        continue;
      }
      const distance = levenshtein(q, h.slice(0, Math.max(q.length, h.length)));
      const similarity = 1 - distance / Math.max(q.length, h.length, 1);
      if (similarity > best) best = similarity;
    }
    total += best;
  }
  return total / queryTokens.length;
}

function buildHighlights(queryTokens: string[], source: string) {
  const lowerSource = source.toLowerCase();
  const highlights = new Set<string>();
  for (const token of queryTokens) {
    const idx = lowerSource.indexOf(token);
    if (idx >= 0) {
      const start = Math.max(0, idx - 18);
      const end = Math.min(source.length, idx + token.length + 28);
      highlights.add(source.slice(start, end));
    }
  }
  return Array.from(highlights).slice(0, 3);
}

function isInDateRange(value: unknown, dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) return true;
  const date = toDate(value);
  if (!date) return false;
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!Number.isNaN(from.getTime()) && date < from) return false;
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (!Number.isNaN(to.getTime()) && date > to) return false;
  }
  return true;
}

export async function globalSearch(params: {
  tenantId: string;
  query: string;
  filters?: GlobalSearchFilters;
  limit?: number;
}) {
  const { tenantId, query, filters = {}, limit = 30 } = params;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [] as GlobalSearchResult[];
  }

  const configs =
    filters.module && filters.module !== 'all'
      ? MODULE_CONFIGS.filter((config) => config.module === filters.module)
      : MODULE_CONFIGS;

  const records: GlobalSearchResult[] = [];

  for (const config of configs) {
    let moduleQuery: FirebaseFirestore.Query = adminDb
      .collection(config.collection)
      .where('tenantId', '==', tenantId)
      .limit(MAX_PER_MODULE_SCAN);

    if (filters.status && config.statusField) {
      moduleQuery = moduleQuery.where(config.statusField, '==', filters.status);
    }

    const snapshot = await moduleQuery.get();
    for (const doc of snapshot.docs) {
      const row = doc.data() as Record<string, unknown>;
      const title = extractFirst(row, config.titleFields) || doc.id;
      const subtitle = extractFirst(row, config.subtitleFields);
      const blob = `${title} ${subtitle} ${config.module}`.trim();
      const blobTokens = tokenize(blob);
      const score = fuzzyTokenScore(queryTokens, blobTokens);
      if (score < 0.42) continue;
      if (!isInDateRange(row[config.dateField || 'createdAt'], filters.dateFrom, filters.dateTo))
        continue;

      const date = toDate(row[config.dateField || 'createdAt']);
      records.push({
        id: doc.id,
        module: config.module,
        title,
        subtitle,
        status: config.statusField ? asString(row[config.statusField]) : undefined,
        date: date ? date.toISOString() : undefined,
        href: config.hrefBuilder(doc.id, row),
        score,
        highlights: buildHighlights(queryTokens, blob),
      });
    }
  }

  return records.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function saveRecentSearch(params: {
  tenantId: string;
  uid: string;
  query: string;
  filters?: GlobalSearchFilters;
}) {
  const payload = {
    tenantId: params.tenantId,
    uid: params.uid,
    query: params.query,
    filters: params.filters || {},
    updatedAt: Timestamp.now(),
  };

  const existing = await adminDb
    .collection('searchRecent')
    .where('tenantId', '==', params.tenantId)
    .where('uid', '==', params.uid)
    .where('query', '==', params.query)
    .limit(1)
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.set(payload, { merge: true });
  } else {
    await adminDb.collection('searchRecent').add({ ...payload, createdAt: Timestamp.now() });
  }

  const trimSnapshot = await adminDb
    .collection('searchRecent')
    .where('tenantId', '==', params.tenantId)
    .where('uid', '==', params.uid)
    .orderBy('updatedAt', 'desc')
    .limit(30)
    .get();

  const deletions = trimSnapshot.docs.slice(10).map((doc) => doc.ref.delete());
  await Promise.all(deletions);
}

export async function getRecentSearches(params: { tenantId: string; uid: string; limit?: number }) {
  const snapshot = await adminDb
    .collection('searchRecent')
    .where('tenantId', '==', params.tenantId)
    .where('uid', '==', params.uid)
    .orderBy('updatedAt', 'desc')
    .limit(params.limit || 10)
    .get();

  return snapshot.docs.map((doc) => {
    const row = doc.data() as Record<string, unknown>;
    const updatedAt = toDate(row.updatedAt);
    return {
      id: doc.id,
      query: asString(row.query),
      filters: (row.filters || {}) as GlobalSearchFilters,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
    };
  });
}

export async function trackSearchAnalytics(params: {
  tenantId: string;
  uid: string;
  query: string;
  totalResults: number;
}) {
  const key = params.query
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 120);
  const ref = adminDb.collection('searchAnalytics').doc(`${params.tenantId}_${params.uid}_${key}`);
  await ref.set(
    {
      tenantId: params.tenantId,
      uid: params.uid,
      query: params.query,
      totalResults: params.totalResults,
      count: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

export async function indexDocument(params: {
  tenantId: string;
  id?: string;
  module: string;
  title: string;
  content?: string;
  status?: string;
  href: string;
  createdAt?: string;
}) {
  const payload = {
    tenantId: params.tenantId,
    module: params.module,
    title: params.title,
    content: params.content || '',
    status: params.status || 'active',
    href: params.href,
    createdAt: params.createdAt ? Timestamp.fromDate(new Date(params.createdAt)) : Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  if (params.id) {
    await adminDb.collection('searchIndex').doc(params.id).set(payload, { merge: true });
    return params.id;
  }

  const doc = await adminDb.collection('searchIndex').add(payload);
  return doc.id;
}

export async function removeIndexedDocument(params: { tenantId: string; id: string }) {
  const ref = adminDb.collection('searchIndex').doc(params.id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const row = doc.data() as { tenantId?: string };
  if (row.tenantId !== params.tenantId) {
    throw new Error('Forbidden');
  }
  await ref.delete();
  return true;
}
