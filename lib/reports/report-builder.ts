import admin from "firebase-admin";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type {
  Aggregation,
  DataSource,
  Report,
  ReportFieldSelection,
  ReportFilter,
  ReportFormat,
  ReportSort,
} from "@/types/reports";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

type RunCustomReportParams = {
  tenantId: string;
  report: Report;
  runtimeFilters?: ReportFilter[];
  page?: number;
  pageSize?: number;
};

type CustomReportResult = {
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export class ReportBuilderService {
  private static readonly COLLECTION_MAP: Record<DataSource, string> = {
    invoices: "invoices",
    payments: "payments",
    expenses: "expenses",
    customers: "customers",
    products: "products",
    users: "users",
    audit_logs: "audit_logs",
    projects: "projects",
    deals: "deals",
    leads: "leads",
    opportunities: "deals",
    time_entries: "time_entries",
    budget_lines: "budget_lines",
    custom: "",
  };

  static getAvailableDataSources() {
    return Object.keys(this.COLLECTION_MAP).filter((source) => source !== "custom") as DataSource[];
  }

  static async discoverFields(tenantId: string, dataSource: DataSource): Promise<ReportFieldSelection[]> {
    const collection = this.resolveCollection(dataSource);
    const snapshot = await adminDb
      .collection(collection)
      .where("tenantId", "==", tenantId)
      .limit(10)
      .get();

    const fieldMap = new Map<string, ReportFieldSelection>();

    snapshot.docs.forEach((doc) => {
      this.flattenRecord(doc.data()).forEach(([field, value]) => {
        if (!fieldMap.has(field)) {
          fieldMap.set(field, {
            field,
            label: field,
            selectedAt: Date.now(),
            type: this.inferType(value),
          });
        }
      });
    });

    return Array.from(fieldMap.values()).sort((a, b) => a.field.localeCompare(b.field));
  }

  static async runCustomReport(params: RunCustomReportParams): Promise<CustomReportResult> {
    const pageSize = Math.max(1, Math.min(params.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
    const page = Math.max(1, params.page || 1);

    const collection = this.resolveCollection(params.report.dataSource);
    let query: Query = adminDb.collection(collection).where("tenantId", "==", params.tenantId);

    const mergedFilters = [...(params.report.filters || []), ...(params.runtimeFilters || [])];
    const { firestoreFilters, clientFilters } = this.partitionFilters(mergedFilters);

    for (const filter of firestoreFilters) {
      query = this.applyFilter(query, filter);
    }

    query = this.applySorting(query, params.report.sorts);

    const shouldAggregate = Boolean(params.report.groupBy?.length || params.report.aggregations?.length);

    if (shouldAggregate) {
      const allData = await this.fetchAllPages(query);
      const filtered = clientFilters.length ? allData.filter((row) => this.matchesFilters(row, clientFilters)) : allData;
      const projected = this.selectFields(filtered, params.report.fields);
      const aggregated = this.applyAggregations(projected, params.report.groupBy, params.report.aggregations);
      const paged = this.paginateRows(aggregated, page, pageSize);

      return {
        rows: paged.rows,
        totalRows: aggregated.length,
        page,
        pageSize,
        hasMore: paged.hasMore,
      };
    }

    const allRows = await this.fetchAllPages(query);
    const filteredRows = clientFilters.length ? allRows.filter((row) => this.matchesFilters(row, clientFilters)) : allRows;
    const selectedRows = this.selectFields(filteredRows, params.report.fields);
    const paged = this.paginateRows(selectedRows, page, pageSize);

    return {
      rows: paged.rows,
      totalRows: selectedRows.length,
      page,
      pageSize,
      hasMore: paged.hasMore,
    };
  }

  static async exportRows(rows: Record<string, unknown>[], format: ReportFormat) {
    switch (format) {
      case "csv":
        return this.toCsv(rows);
      case "xlsx":
        return this.toXlsxXml(rows);
      case "pdf":
        return this.toPdfLikeText(rows);
      default:
        return "";
    }
  }

  private static resolveCollection(dataSource: DataSource) {
    const collection = this.COLLECTION_MAP[dataSource];
    if (!collection) {
      throw new Error(`Unsupported data source: ${dataSource}`);
    }
    return collection;
  }

  private static async fetchAllPages(query: Query) {
    const rows: Record<string, unknown>[] = [];
    let cursor: QueryDocumentSnapshot | null = null;
    let hasMore = true;

    while (hasMore) {
      let pageQuery = query.limit(MAX_PAGE_SIZE);
      if (cursor) {
        pageQuery = pageQuery.startAfter(cursor);
      }
      const snapshot = await pageQuery.get();
      if (snapshot.empty) {
        break;
      }

      rows.push(...snapshot.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() })));
      cursor = snapshot.docs[snapshot.docs.length - 1];
      hasMore = snapshot.size === MAX_PAGE_SIZE;
    }

    return rows;
  }

  private static partitionFilters(filters: ReportFilter[]) {
    const firestoreFilters: ReportFilter[] = [];
    const clientFilters: ReportFilter[] = [];

    for (const filter of filters) {
      if (this.isFirestoreCompatible(filter)) {
        firestoreFilters.push(filter);
      } else {
        clientFilters.push(filter);
      }
    }

    return { firestoreFilters, clientFilters };
  }

  private static isFirestoreCompatible(filter: ReportFilter) {
    if (["startsWith", "endsWith", "contains", "notContains"].includes(filter.operator)) {
      return false;
    }
    if (filter.operator === "between") {
      return Array.isArray(filter.value) && filter.value.length === 2;
    }
    return true;
  }

  private static applyFilter(query: Query, filter: ReportFilter) {
    const normalizedValue = this.normalizeFilterValue(filter.value);

    switch (filter.operator) {
      case "equals":
        return query.where(filter.field, "==", normalizedValue);
      case "notEquals":
        return query.where(filter.field, "!=", normalizedValue);
      case "greaterThan":
        return query.where(filter.field, ">", normalizedValue);
      case "greaterThanOrEqual":
        return query.where(filter.field, ">=", normalizedValue);
      case "lessThan":
        return query.where(filter.field, "<", normalizedValue);
      case "lessThanOrEqual":
        return query.where(filter.field, "<=", normalizedValue);
      case "between":
        if (Array.isArray(normalizedValue) && normalizedValue.length === 2) {
          return query.where(filter.field, ">=", normalizedValue[0]).where(filter.field, "<=", normalizedValue[1]);
        }
        return query;
      case "in":
        return Array.isArray(normalizedValue) ? query.where(filter.field, "in", normalizedValue) : query;
      case "notIn":
        return Array.isArray(normalizedValue) ? query.where(filter.field, "not-in", normalizedValue) : query;
      case "isNull":
        return query.where(filter.field, "==", null);
      case "isNotNull":
        return query.where(filter.field, "!=", null);
      default:
        return query;
    }
  }

  private static applySorting(query: Query, sorts?: ReportSort[]) {
    if (!sorts?.length) {
      return query.orderBy("createdAt", "desc");
    }

    let nextQuery = query;
    for (const sort of sorts) {
      nextQuery = nextQuery.orderBy(sort.field, sort.direction);
    }

    return nextQuery;
  }

  private static selectFields(rows: Record<string, unknown>[], fields?: ReportFieldSelection[]) {
    if (!fields?.length) {
      return rows;
    }

    return rows.map((row) => {
      const selected: Record<string, unknown> = {};
      for (const field of fields) {
        selected[field.alias || field.field] = this.getFieldValue(row, field.field);
      }
      return selected;
    });
  }

  private static applyAggregations(rows: Record<string, unknown>[], groupBy?: string[], aggregations?: Aggregation[]) {
    if (!aggregations?.length) {
      return rows;
    }

    if (!groupBy?.length) {
      const summary: Record<string, unknown> = {};
      for (const aggregation of aggregations) {
        summary[aggregation.alias || `${aggregation.function}_${aggregation.field}`] = this.calculateAggregation(rows, aggregation);
      }
      return [summary];
    }

    const groups = new Map<string, Record<string, unknown>[]>();

    for (const row of rows) {
      const groupKey = groupBy.map((field) => String(this.getFieldValue(row, field) ?? "")).join("||");
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(row);
    }

    const output: Record<string, unknown>[] = [];
    groups.forEach((groupRows, key) => {
      const row: Record<string, unknown> = {};
      const groupValues = key.split("||");
      groupBy.forEach((field, index) => {
        row[field] = groupValues[index];
      });

      for (const aggregation of aggregations) {
        row[aggregation.alias || `${aggregation.function}_${aggregation.field}`] = this.calculateAggregation(groupRows, aggregation);
      }

      output.push(row);
    });

    return output;
  }

  private static calculateAggregation(rows: Record<string, unknown>[], aggregation: Aggregation) {
    const values = rows.map((row) => this.toNumber(this.getFieldValue(row, aggregation.field))).filter((v) => !Number.isNaN(v));

    switch (aggregation.function) {
      case "sum":
        return values.reduce((sum, value) => sum + value, 0);
      case "avg":
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      case "count":
        return rows.length;
      case "min":
        return values.length ? Math.min(...values) : 0;
      case "max":
        return values.length ? Math.max(...values) : 0;
      default:
        return 0;
    }
  }

  private static paginateRows(rows: Record<string, unknown>[], page: number, pageSize: number) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      rows: rows.slice(start, end),
      hasMore: end < rows.length,
    };
  }

  private static matchesFilters(item: Record<string, unknown>, filters: ReportFilter[]) {
    return filters.every((filter) => this.matchesFilter(item, filter));
  }

  private static matchesFilter(item: Record<string, unknown>, filter: ReportFilter) {
    const value = this.getFieldValue(item, filter.field);
    const expected = this.normalizeFilterValue(filter.value);

    switch (filter.operator) {
      case "equals":
        return value === expected;
      case "notEquals":
        return value !== expected;
      case "contains":
        return this.containsValue(value, expected);
      case "notContains":
        return !this.containsValue(value, expected);
      case "startsWith":
        return typeof value === "string" && typeof expected === "string"
          ? value.toLowerCase().startsWith(expected.toLowerCase())
          : false;
      case "endsWith":
        return typeof value === "string" && typeof expected === "string"
          ? value.toLowerCase().endsWith(expected.toLowerCase())
          : false;
      case "greaterThan":
        return this.toNumber(value) > this.toNumber(expected);
      case "greaterThanOrEqual":
        return this.toNumber(value) >= this.toNumber(expected);
      case "lessThan":
        return this.toNumber(value) < this.toNumber(expected);
      case "lessThanOrEqual":
        return this.toNumber(value) <= this.toNumber(expected);
      case "between":
        if (Array.isArray(expected) && expected.length === 2) {
          return this.toNumber(value) >= this.toNumber(expected[0]) && this.toNumber(value) <= this.toNumber(expected[1]);
        }
        return false;
      case "in":
        return Array.isArray(expected) ? expected.includes(value) : false;
      case "notIn":
        return Array.isArray(expected) ? !expected.includes(value) : false;
      case "isNull":
        return value == null;
      case "isNotNull":
        return value != null;
      default:
        return true;
    }
  }

  private static normalizeFilterValue(value: unknown) {
    if (typeof value === "string" && value.includes(",")) {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return value;
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

  private static containsValue(fieldValue: unknown, expected: unknown) {
    if (Array.isArray(fieldValue)) {
      return fieldValue.includes(expected);
    }
    if (typeof fieldValue === "string" && typeof expected === "string") {
      return fieldValue.toLowerCase().includes(expected.toLowerCase());
    }
    return false;
  }

  private static toNumber(value: unknown) {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }

  private static inferType(value: unknown): ReportFieldSelection["type"] {
    if (value == null) return "string";
    if (value instanceof Date || typeof (value as unknown)?.toDate as unknown === "function") return "date";
    if (Array.isArray(value)) return "array";
    const t = typeof value;
    if (t === "number") return "number";
    if (t === "boolean") return "boolean";
    if (t === "object") return "object";
    return "string";
  }

  private static flattenRecord(record: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
    const entries: Array<[string, unknown]> = [];

    Object.entries(record).forEach(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (
        value
        && typeof value === "object"
        && !Array.isArray(value)
        && !(value instanceof Date)
        && typeof (value as unknown)?.toDate as unknown !== "function"
      ) {
        entries.push(...this.flattenRecord(value as Record<string, unknown>, path));
      } else {
        entries.push([path, value]);
      }
    });

    return entries;
  }

  private static toCsv(rows: Record<string, unknown>[]) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    const lines = rows.map((row) => headers.map((header) => this.escapeCell(row[header])).join(","));
    return [headers.join(","), ...lines].join("\n");
  }

  private static toXlsxXml(rows: Record<string, unknown>[]) {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const headerCells = headers.map((header) => `<Cell><Data ss:Type=\"String\">${this.escapeXml(header)}</Data></Cell>`).join("");
    const bodyRows = rows
      .map((row) => {
        const cells = headers
          .map((header) => `<Cell><Data ss:Type=\"String\">${this.escapeXml(String(row[header] ?? ""))}</Data></Cell>`)
          .join("");
        return `<Row>${cells}</Row>`;
      })
      .join("");

    return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Report">
    <Table>
      <Row>${headerCells}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;
  }

  private static toPdfLikeText(rows: Record<string, unknown>[]) {
    const now = new Date().toISOString();
    return [`Report export generated at ${now}`, "", this.toCsv(rows)].join("\n");
  }

  private static escapeCell(value: unknown) {
    const normalized = this.toDisplayValue(value);
    return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
  }

  private static toDisplayValue(value: unknown) {
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof (value as unknown)?.toDate as unknown === "function") {
      return (value as unknown).toDate().toISOString();
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private static escapeXml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  static computeNextRunAt(schedule: Report["schedule"]) {
    if (!schedule) {
      throw new Error("Schedule is required");
    }

    const now = new Date();
    const [hourStr, minuteStr] = schedule.time.split(":");
    const hour = Number(hourStr || "0");
    const minute = Number(minuteStr || "0");

    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(hour, minute, 0, 0);

    if (schedule.frequency === "daily") {
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else if (schedule.frequency === "weekly") {
      const targetDay = schedule.dayOfWeek ?? 1;
      const delta = (targetDay - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + delta);
      if (next <= now) {
        next.setDate(next.getDate() + 7);
      }
    } else {
      const targetDay = schedule.dayOfMonth ?? 1;
      next.setDate(targetDay);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1, targetDay);
      }
    }

    return admin.firestore.Timestamp.fromDate(next);
  }
}
