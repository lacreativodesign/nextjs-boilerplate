import admin from "firebase-admin";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { Aggregation, Report, ReportExecution, ReportFilter } from "@/types/reports";
import { getPresetReportById } from "@/lib/reports/preset-reports";
import crypto from "crypto";

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 1000;

export class ReportEngine {
  static async executeReport(params: {
    tenantId: string;
    reportId: string;
    userId: string;
    filters?: ReportFilter[];
    dateRange?: { start: Date; end: Date };
    pageSize?: number;
    pageToken?: string | null;
  }) {
    const startTime = Date.now();
    let report: Report | null = null;
    let isPreset = false;

    try {
      const preset = getPresetReportById(params.reportId);
      if (preset) {
        report = {
          id: preset.id,
          tenantId: params.tenantId,
          name: preset.name,
          description: preset.description,
          category: preset.category,
          type: "preset",
          dataSource: preset.dataSource,
          filters: preset.filters as ReportFilter[],
          groupBy: preset.groupBy,
          aggregations: preset.aggregations,
          chartType: preset.chartType,
          chartConfig: preset.chartConfig,
          isScheduled: false,
          createdBy: "system",
          isPublic: true,
          runCount: 0,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        };
        isPreset = true;
      } else {
        const reportDoc = await adminDb.collection("reports").doc(params.reportId).get();
        if (!reportDoc.exists) {
          throw new Error("Report not found");
        }
        report = { id: reportDoc.id, ...reportDoc.data() } as Report;
      }

      if (!report) {
        throw new Error("Report not found");
      }

      if (report.tenantId !== params.tenantId) {
        throw new Error("Unauthorized");
      }

      const pageSize = Math.min(Math.max(params.pageSize || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const cacheKey = this.buildCacheKey({
        tenantId: params.tenantId,
        reportId: report.id,
        filters: params.filters || report.filters,
        dateRange: params.dateRange,
        pageToken: params.pageToken || null,
        pageSize,
      });

      const cached = await this.getCache(cacheKey);
      if (cached) {
        await this.logExecution({
          tenantId: params.tenantId,
          reportId: report.id,
          executedBy: params.userId,
          status: "success",
          duration: Date.now() - startTime,
          rowCount: cached.data.length,
          filters: params.filters || report.filters,
          dateRange: params.dateRange,
        });

        return {
          data: cached.data,
          metadata: {
            rowCount: cached.data.length,
            executedAt: new Date(),
            duration: Date.now() - startTime,
            pageToken: cached.pageToken,
            nextPageToken: cached.nextPageToken || null,
            cached: true,
          },
        };
      }

      const results = await this.buildAndExecuteQuery(report, params.filters, params.dateRange, {
        pageSize,
        pageToken: params.pageToken || null,
      });

      const duration = Date.now() - startTime;
      await this.logExecution({
        tenantId: params.tenantId,
        reportId: report.id,
        executedBy: params.userId,
        status: "success",
        duration,
        rowCount: results.data.length,
        filters: params.filters || report.filters,
        dateRange: params.dateRange,
      });

      if (!isPreset) {
        await adminDb.collection("reports").doc(report.id).update({
          lastRunAt: admin.firestore.Timestamp.now(),
          lastRunDuration: duration,
          runCount: admin.firestore.FieldValue.increment(1),
        });
      }

      await this.setCache(cacheKey, {
        data: results.data,
        pageToken: params.pageToken || null,
        nextPageToken: results.nextPageToken || null,
      });

      return {
        data: results.data,
        metadata: {
          rowCount: results.data.length,
          executedAt: new Date(),
          duration,
          pageToken: params.pageToken || null,
          nextPageToken: results.nextPageToken || null,
          cached: false,
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      await this.logExecution({
        tenantId: params.tenantId,
        reportId: params.reportId,
        executedBy: params.userId,
        status: "failed",
        duration,
        rowCount: 0,
        errorMessage: error?.message || "Unknown error",
        filters: params.filters || [],
        dateRange: params.dateRange,
      });

      throw error;
    }
  }

  private static buildCacheKey(payload: Record<string, unknown>) {
    const normalized = this.sortObject(payload);
    const raw = JSON.stringify(normalized);
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  private static sortObject(value: any): any {
    if (Array.isArray(value)) {
      return value.map((entry) => this.sortObject(entry));
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((acc: Record<string, unknown>, key) => {
          acc[key] = this.sortObject(value[key]);
          return acc;
        }, {});
    }
    return value;
  }

  private static async getCache(cacheKey: string) {
    const snap = await adminDb.collection("report_cache").doc(cacheKey).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const expiresAt = data.expiresAt?.toDate?.() || null;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      await snap.ref.delete();
      return null;
    }
    return data as { data: any[]; pageToken?: string | null; nextPageToken?: string | null };
  }

  private static async setCache(
    cacheKey: string,
    payload: { data: any[]; pageToken?: string | null; nextPageToken?: string | null }
  ) {
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + CACHE_TTL_MS));
    await adminDb
      .collection("report_cache")
      .doc(cacheKey)
      .set({
        ...payload,
        createdAt: now,
        expiresAt,
      });
  }

  private static async buildAndExecuteQuery(
    report: Report,
    additionalFilters?: ReportFilter[],
    dateRange?: { start: Date; end: Date },
    pagination?: { pageSize: number; pageToken: string | null }
  ) {
    if (report.dataSource === "custom") {
      return this.runCustomReport(report, additionalFilters, dateRange);
    }

    const collection = this.resolveCollection(report.dataSource);
    let query: Query = adminDb.collection(collection);

    const allFilters = [...(report.filters || []), ...(additionalFilters || [])];
    const { firestoreFilters, clientFilters } = this.partitionFilters(allFilters);

    for (const filter of firestoreFilters) {
      query = this.applyFilter(query, filter);
    }

    if (dateRange) {
      query = query
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(dateRange.start))
        .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(dateRange.end));
    }

    query = query.orderBy("createdAt", "desc");

    const shouldAggregate = Boolean(report.aggregations && report.aggregations.length > 0);
    const pageSize = pagination?.pageSize || DEFAULT_PAGE_SIZE;

    if (shouldAggregate) {
      let results: any[] = [];
      let lastDoc: QueryDocumentSnapshot | null = null;
      let hasMore = true;
      while (hasMore) {
        let pageQuery = query.limit(MAX_PAGE_SIZE);
        if (lastDoc) pageQuery = pageQuery.startAfter(lastDoc);
        const pageSnap = await pageQuery.get();
        if (pageSnap.empty) break;
        results = results.concat(pageSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        lastDoc = pageSnap.docs[pageSnap.docs.length - 1];
        hasMore = pageSnap.size === MAX_PAGE_SIZE;
      }
      let data = results;
      if (clientFilters.length) {
        data = data.filter((item) => this.matchesFilters(item, clientFilters));
      }

      data = data.map((row) => this.applyDerivedFields(row, report));
      data = this.applyAggregations(data, report.groupBy, report.aggregations);
      return { data, nextPageToken: null };
    }

    if (pagination?.pageToken) {
      const cursorSnap = await adminDb.collection(collection).doc(pagination.pageToken).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    query = query.limit(pageSize);

    const snapshot = await query.get();
    let data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Array<{ id: string } & Record<string, any>>;

    if (clientFilters.length) {
      data = data.filter((item) => this.matchesFilters(item, clientFilters));
    }

    data = data.map((row) => this.applyDerivedFields(row, report)) as Array<{ id: string } & Record<string, any>>;

    const nextPageToken = snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null;
    return { data, nextPageToken };
  }

  private static resolveCollection(dataSource: string) {
    if (dataSource === "opportunities") return "deals";
    return dataSource;
  }

  private static runCustomReport(
    report: Report,
    additionalFilters?: ReportFilter[],
    dateRange?: { start: Date; end: Date }
  ) {
    if (report.id === "profit-loss") {
      return this.runProfitLossReport(report, additionalFilters, dateRange);
    }

    throw new Error("Custom report handler not found");
  }

  private static async runProfitLossReport(
    report: Report,
    additionalFilters?: ReportFilter[],
    dateRange?: { start: Date; end: Date }
  ) {
    const [invoicesSnap, expensesSnap] = await Promise.all([
      this.queryCollection("invoices", report, additionalFilters, dateRange),
      this.queryCollection("expenses", report, additionalFilters, dateRange),
    ]);

    const invoices = invoicesSnap.map((row) => this.applyDerivedFields(row, report));
    const expenses = expensesSnap.map((row) => this.applyDerivedFields(row, report));

    const revenue = invoices.reduce((sum, row) => sum + this.toNumber(row.total || row.amount), 0);
    const expenseTotal = expenses.reduce((sum, row) => sum + this.toNumber(row.total || row.amount), 0);

    return {
      data: [
        { label: "Revenue", value: revenue },
        { label: "Expenses", value: expenseTotal },
        { label: "Net Profit", value: revenue - expenseTotal },
      ],
      nextPageToken: null,
    };
  }

  private static async queryCollection(
    collection: string,
    report: Report,
    additionalFilters?: ReportFilter[],
    dateRange?: { start: Date; end: Date }
  ) {
    let query: Query = adminDb.collection(collection);

    const allFilters = [...(report.filters || []), ...(additionalFilters || [])];
    const { firestoreFilters, clientFilters } = this.partitionFilters(allFilters);

    for (const filter of firestoreFilters) {
      query = this.applyFilter(query, filter);
    }

    if (dateRange) {
      query = query
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(dateRange.start))
        .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(dateRange.end));
    }

    query = query.orderBy("createdAt", "desc");

    const snapshot = await query.limit(1000).get();
    let data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (clientFilters.length) {
      data = data.filter((item) => this.matchesFilters(item, clientFilters));
    }

    return data;
  }

  private static partitionFilters(filters: ReportFilter[]) {
    const firestoreFilters: ReportFilter[] = [];
    const clientFilters: ReportFilter[] = [];

    for (const filter of filters) {
      if (this.isFirestoreSupported(filter)) {
        firestoreFilters.push(filter);
      } else {
        clientFilters.push(filter);
      }
    }

    return { firestoreFilters, clientFilters };
  }

  private static isFirestoreSupported(filter: ReportFilter) {
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

  private static applyDerivedFields(row: Record<string, any>, report: Report) {
    const createdAt = this.toDate(row.createdAt);
    if (createdAt) {
      row.month = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
      row.week = `${createdAt.getFullYear()}-W${String(this.getWeekNumber(createdAt)).padStart(2, "0")}`;
      row.day = createdAt.toISOString().slice(0, 10);
    }

    if (report.groupBy?.includes("ageGroup")) {
      const referenceDate = this.toDate(row.dueDate || row.createdAt || row.updatedAt);
      if (referenceDate) {
        const ageInDays = Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / (24 * 60 * 60 * 1000)));
        if (ageInDays <= 30) row.ageGroup = "0-30";
        else if (ageInDays <= 60) row.ageGroup = "31-60";
        else if (ageInDays <= 90) row.ageGroup = "61-90";
        else row.ageGroup = "90+";
      }
    }

    return row;
  }

  private static getWeekNumber(date: Date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const pastDays = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  }

  private static applyAggregations(data: any[], groupBy?: string[], aggregations?: Aggregation[]) {
    if (!aggregations || aggregations.length === 0) return data;

    if (!groupBy || groupBy.length === 0) {
      const result: any = {};
      aggregations.forEach((agg) => {
        const alias = agg.alias || agg.field;
        result[alias] = this.calculateAggregation(data, agg);
      });
      return [result];
    }

    const groups = data.reduce((acc: Record<string, any[]>, row: any) => {
      const key = groupBy.map((field) => row[field]).join("|");
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(row);
      return acc;
    }, {});

    return Object.entries(groups).map(([key, rows]: [string, any[]]) => {
      const result: any = {};
      const keyParts = key.split("|");
      groupBy.forEach((field, index) => {
        result[field] = keyParts[index];
      });

      aggregations.forEach((agg) => {
        const alias = agg.alias || agg.field;
        result[alias] = this.calculateAggregation(rows, agg);
      });

      return result;
    });
  }

  private static calculateAggregation(data: any[], agg: Aggregation): number {
    const values = data.map((row) => row[agg.field]).filter((value) => value != null);

    switch (agg.function) {
      case "sum":
        return values.reduce((sum, val) => sum + Number(val || 0), 0);
      case "avg":
        return values.length ? values.reduce((sum, val) => sum + Number(val || 0), 0) / values.length : 0;
      case "count":
        return values.length;
      case "min":
        return values.length ? Math.min(...values.map((val) => Number(val))) : 0;
      case "max":
        return values.length ? Math.max(...values.map((val) => Number(val))) : 0;
      default:
        return 0;
    }
  }

  private static applyFilter(query: FirebaseFirestore.Query, filter: ReportFilter) {
    const { field, operator, value } = filter;
    const normalizedValue = this.normalizeFilterValue(value);

    switch (operator) {
      case "equals":
        return query.where(field, "==", normalizedValue);
      case "notEquals":
        return query.where(field, "!=", normalizedValue);
      case "greaterThan":
        return query.where(field, ">", normalizedValue);
      case "greaterThanOrEqual":
        return query.where(field, ">=", normalizedValue);
      case "lessThan":
        return query.where(field, "<", normalizedValue);
      case "lessThanOrEqual":
        return query.where(field, "<=", normalizedValue);
      case "between":
        if (Array.isArray(normalizedValue) && normalizedValue.length === 2) {
          return query.where(field, ">=", normalizedValue[0]).where(field, "<=", normalizedValue[1]);
        }
        return query;
      case "in":
        return Array.isArray(normalizedValue) ? query.where(field, "in", normalizedValue) : query;
      case "notIn":
        return Array.isArray(normalizedValue) ? query.where(field, "not-in", normalizedValue) : query;
      case "contains":
        return query.where(field, "array-contains", normalizedValue);
      case "isNull":
        return query.where(field, "==", null);
      case "isNotNull":
        return query.where(field, "!=", null);
      default:
        return query;
    }
  }

  private static matchesFilters(item: Record<string, unknown>, filters: ReportFilter[]) {
    return filters.every((filter) => this.matchesFilter(item, filter));
  }

  private static matchesFilter(item: Record<string, unknown>, filter: ReportFilter) {
    const { field, operator, value } = filter;
    const fieldValue = this.getFieldValue(item, field);
    const normalizedValue = this.normalizeFilterValue(value);

    switch (operator) {
      case "equals":
        return fieldValue === normalizedValue;
      case "notEquals":
        return fieldValue !== normalizedValue;
      case "contains":
        return this.containsValue(fieldValue, normalizedValue);
      case "notContains":
        return !this.containsValue(fieldValue, normalizedValue);
      case "startsWith":
        return typeof fieldValue === "string" && typeof normalizedValue === "string"
          ? fieldValue.toLowerCase().startsWith(normalizedValue.toLowerCase())
          : false;
      case "endsWith":
        return typeof fieldValue === "string" && typeof normalizedValue === "string"
          ? fieldValue.toLowerCase().endsWith(normalizedValue.toLowerCase())
          : false;
      case "greaterThan":
        return this.toNumber(fieldValue) > this.toNumber(normalizedValue);
      case "greaterThanOrEqual":
        return this.toNumber(fieldValue) >= this.toNumber(normalizedValue);
      case "lessThan":
        return this.toNumber(fieldValue) < this.toNumber(normalizedValue);
      case "lessThanOrEqual":
        return this.toNumber(fieldValue) <= this.toNumber(normalizedValue);
      case "between":
        if (Array.isArray(normalizedValue) && normalizedValue.length === 2) {
          return this.toNumber(fieldValue) >= this.toNumber(normalizedValue[0])
            && this.toNumber(fieldValue) <= this.toNumber(normalizedValue[1]);
        }
        return true;
      case "in":
        return Array.isArray(normalizedValue) ? normalizedValue.includes(fieldValue) : false;
      case "notIn":
        return Array.isArray(normalizedValue) ? !normalizedValue.includes(fieldValue) : false;
      case "isNull":
        return fieldValue == null;
      case "isNotNull":
        return fieldValue != null;
      default:
        return true;
    }
  }

  private static getFieldValue(item: Record<string, unknown>, field: string) {
    if (!field.includes(".")) return item[field];
    return field.split(".").reduce((acc: any, key) => (acc ? acc[key] : undefined), item);
  }

  private static containsValue(fieldValue: unknown, value: unknown) {
    if (Array.isArray(fieldValue)) {
      return fieldValue.includes(value);
    }
    if (typeof fieldValue === "string" && typeof value === "string") {
      return fieldValue.toLowerCase().includes(value.toLowerCase());
    }
    return false;
  }

  private static normalizeFilterValue(value: unknown) {
    if (typeof value === "string") {
      if (value === "CURRENT_YEAR_START") {
        return admin.firestore.Timestamp.fromDate(new Date(new Date().getFullYear(), 0, 1));
      }
      if (value === "CURRENT_MONTH_START") {
        return admin.firestore.Timestamp.fromDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      }
      if (value === "LAST_90_DAYS") {
        return admin.firestore.Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
      }
      if (value === "LAST_180_DAYS") {
        return admin.firestore.Timestamp.fromDate(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
      }
      if (value === "TODAY") {
        const now = new Date();
        return admin.firestore.Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      }
      if (value.includes(",")) {
        return value.split(",").map((entry) => entry.trim()).filter(Boolean);
      }
    }
    return value;
  }

  private static toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private static toNumber(value: unknown) {
    const num = Number(value);
    return Number.isNaN(num) ? 0 : num;
  }

  private static async logExecution(execution: Omit<ReportExecution, "id" | "executedAt" | "resultSize">) {
    await adminDb.collection("report_executions").add({
      ...execution,
      executedAt: admin.firestore.Timestamp.now(),
      resultSize: 0,
    });
  }

  static async exportToCSV(data: any[]): Promise<string> {
    if (!data.length) return "";

    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const formatted = value instanceof Date ? value.toISOString() : value;
          return typeof formatted === "string" && formatted.includes(",") ? `"${formatted}"` : formatted;
        })
        .join(",")
    );

    return [headers.join(","), ...rows].join("\n");
  }
}
