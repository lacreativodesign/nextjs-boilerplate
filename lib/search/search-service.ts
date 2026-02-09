import { adminDb } from "@/lib/firebaseAdmin";
import type { SearchFilter } from "@/types/search";

type FilterPartition = {
  firestoreFilters: SearchFilter[];
  clientFilters: SearchFilter[];
};

type Comparable = string | number | Date | null | undefined;

export class SearchService {
  /**
   * Build Firestore query from filters
   */
  static buildQuery(
    collection: string,
    tenantId: string,
    filters: SearchFilter[],
    sortBy?: string,
    sortOrder: "asc" | "desc" = "desc"
  ) {
    return this.buildQueryWithFilters(collection, tenantId, filters, sortBy, sortOrder).query;
  }

  /**
   * Build query + return client-side filters for operators Firestore can't represent.
   */
  static buildQueryWithFilters(
    collection: string,
    tenantId: string,
    filters: SearchFilter[],
    sortBy?: string,
    sortOrder: "asc" | "desc" = "desc"
  ) {
    const { firestoreFilters, clientFilters } = this.partitionFilters(filters);
    let query: FirebaseFirestore.Query = adminDb.collection(collection).where("tenantId", "==", tenantId);

    for (const filter of firestoreFilters) {
      query = this.applyFilter(query, filter);
    }

    if (sortBy) {
      query = query.orderBy(sortBy, sortOrder);
    }

    return { query, clientFilters };
  }

  /**
   * Execute search with pagination
   */
  static async search(params: {
    collection: string;
    tenantId: string;
    filters: SearchFilter[];
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }) {
    const { collection, tenantId, filters, sortBy, sortOrder, limit = 50, offset = 0 } = params;
    const { query, clientFilters } = this.buildQueryWithFilters(
      collection,
      tenantId,
      filters,
      sortBy,
      sortOrder
    );

    if (clientFilters.length === 0) {
      const countSnapshot = await query.count().get();
      const total = countSnapshot.data().count;
      let pagedQuery = query;
      if (offset > 0) {
        pagedQuery = pagedQuery.offset(offset);
      }
      pagedQuery = pagedQuery.limit(limit);
      const snapshot = await pagedQuery.get();
      const results = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      return { results, total };
    }

    return this.searchWithClientFilters({
      query,
      clientFilters,
      limit,
      offset,
    });
  }

  /**
   * Full-text search using Firestore text search (limited)
   * For production, consider Algolia or Elasticsearch
   */
  static async fullTextSearch(params: {
    collection: string;
    tenantId: string;
    searchText: string;
    searchFields: string[];
    limit?: number;
  }) {
    const { collection, tenantId, searchText, searchFields, limit = 20 } = params;

    const query = adminDb.collection(collection).where("tenantId", "==", tenantId).limit(limit);
    const snapshot = await query.get();

    const normalized = searchText.toLowerCase();
    const results = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) =>
        searchFields.some((field) => {
          const value = this.getFieldValue(item, field);
          return typeof value === "string" && value.toLowerCase().includes(normalized);
        })
      );

    return results;
  }

  static filterResults<T extends Record<string, unknown>>(results: T[], filters: SearchFilter[]) {
    if (!filters || filters.length === 0) return results;
    return results.filter((item) => this.matchesFilters(item, filters));
  }

  private static async searchWithClientFilters(params: {
    query: FirebaseFirestore.Query;
    clientFilters: SearchFilter[];
    limit: number;
    offset: number;
  }) {
    const { query, clientFilters, limit, offset } = params;
    const pageSize = Math.max(limit * 3, 100);
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let done = false;
    let total = 0;
    const results: Array<Record<string, unknown>> = [];

    while (!done) {
      let pagedQuery = query.limit(pageSize);
      if (lastDoc) {
        pagedQuery = pagedQuery.startAfter(lastDoc);
      }

      const snapshot = await pagedQuery.get();
      if (snapshot.empty) {
        done = true;
        break;
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      const batch = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const filtered = batch.filter((item) => this.matchesFilters(item, clientFilters));

      total += filtered.length;

      for (const item of filtered) {
        if (total <= offset) continue;
        if (results.length < limit) {
          results.push(item);
        }
      }

      if (results.length >= limit) {
        if (filtered.length + offset >= total) {
          done = true;
        }
      }
    }

    return { results, total };
  }

  private static partitionFilters(filters: SearchFilter[]): FilterPartition {
    const firestoreFilters: SearchFilter[] = [];
    const clientFilters: SearchFilter[] = [];

    for (const filter of filters) {
      if (this.isFirestoreSupported(filter)) {
        firestoreFilters.push(filter);
      } else {
        clientFilters.push(filter);
      }
    }

    return { firestoreFilters, clientFilters };
  }

  private static isFirestoreSupported(filter: SearchFilter) {
    const { operator, value } = filter;
    if (operator === "startsWith" || operator === "endsWith" || operator === "notContains") {
      return false;
    }
    if (operator === "contains" && typeof value === "string") {
      return false;
    }
    if (operator === "between") {
      return Array.isArray(value) && value.length === 2;
    }
    return true;
  }

  /**
   * Apply individual filter to query
   */
  private static applyFilter(query: FirebaseFirestore.Query, filter: SearchFilter) {
    const { field, operator, value } = filter;

    switch (operator) {
      case "equals":
        return query.where(field, "==", value);
      case "notEquals":
        return query.where(field, "!=", value);
      case "greaterThan":
        return query.where(field, ">", value);
      case "lessThan":
        return query.where(field, "<", value);
      case "greaterThanOrEqual":
        return query.where(field, ">=", value);
      case "lessThanOrEqual":
        return query.where(field, "<=", value);
      case "between":
        if (Array.isArray(value) && value.length === 2) {
          return query.where(field, ">=", value[0]).where(field, "<=", value[1]);
        }
        return query;
      case "in":
        return query.where(field, "in", value);
      case "notIn":
        return query.where(field, "not-in", value);
      case "contains":
        return query.where(field, "array-contains", value);
      case "isNull":
        return query.where(field, "==", null);
      case "isNotNull":
        return query.where(field, "!=", null);
      default:
        return query;
    }
  }

  private static matchesFilters(item: Record<string, unknown>, filters: SearchFilter[]) {
    return filters.every((filter) => this.matchesFilter(item, filter));
  }

  private static matchesFilter(item: Record<string, unknown>, filter: SearchFilter) {
    const { field, operator, value } = filter;
    const fieldValue = this.getFieldValue(item, field);

    switch (operator) {
      case "equals":
        return fieldValue === value;
      case "notEquals":
        return fieldValue !== value;
      case "contains":
        return this.containsValue(fieldValue, value);
      case "notContains":
        return !this.containsValue(fieldValue, value);
      case "startsWith":
        return this.matchString(fieldValue, value, (a, b) => a.startsWith(b));
      case "endsWith":
        return this.matchString(fieldValue, value, (a, b) => a.endsWith(b));
      case "greaterThan":
        return this.compareValues(fieldValue, value, (a, b) => a > b);
      case "lessThan":
        return this.compareValues(fieldValue, value, (a, b) => a < b);
      case "greaterThanOrEqual":
        return this.compareValues(fieldValue, value, (a, b) => a >= b);
      case "lessThanOrEqual":
        return this.compareValues(fieldValue, value, (a, b) => a <= b);
      case "between":
        if (Array.isArray(value) && value.length === 2) {
          return (
            this.compareValues(fieldValue, value[0], (a, b) => a >= b) &&
            this.compareValues(fieldValue, value[1], (a, b) => a <= b)
          );
        }
        return false;
      case "in":
        return Array.isArray(value) ? value.includes(fieldValue) : false;
      case "notIn":
        return Array.isArray(value) ? !value.includes(fieldValue) : false;
      case "isNull":
        return fieldValue === null || fieldValue === undefined;
      case "isNotNull":
        return fieldValue !== null && fieldValue !== undefined;
      default:
        return true;
    }
  }

  private static containsValue(fieldValue: unknown, searchValue: unknown) {
    if (typeof fieldValue === "string" && typeof searchValue === "string") {
      return fieldValue.toLowerCase().includes(searchValue.toLowerCase());
    }
    if (Array.isArray(fieldValue)) {
      return fieldValue.includes(searchValue);
    }
    return false;
  }

  private static matchString(
    fieldValue: unknown,
    searchValue: unknown,
    predicate: (value: string, search: string) => boolean
  ) {
    if (typeof fieldValue !== "string" || typeof searchValue !== "string") {
      return false;
    }
    return predicate(fieldValue.toLowerCase(), searchValue.toLowerCase());
  }

  private static compareValues(
    fieldValue: unknown,
    searchValue: unknown,
    comparator: (a: Comparable, b: Comparable) => boolean
  ) {
    const left = this.normalizeComparable(fieldValue);
    const right = this.normalizeComparable(searchValue);
    if (left === undefined || right === undefined) return false;
    if (left === null || right === null) return false;
    return comparator(left, right);
  }

  private static normalizeComparable(value: unknown): Comparable {
    if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
      return value.toDate();
    }
    return value as Comparable;
  }

  private static getFieldValue(item: Record<string, unknown>, field: string) {
    if (!field.includes(".")) {
      return item[field];
    }
    return field.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, item);
  }
}
