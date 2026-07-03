import crypto from 'crypto';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import type {
  ImportEntity,
  ImportFieldMapping,
  ImportFileFormat,
  ImportJob,
  ImportRowError,
} from '@/types/import-export';

const entitySchemas: Record<ImportEntity, z.ZodObject<any>> = {
  clients: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    status: z.string().optional(),
  }),
  invoices: z.object({
    invoiceNumber: z.string().min(1),
    customerName: z.string().min(1),
    status: z.string().min(1),
    total: z.coerce.number().min(0),
  }),
  products: z.object({
    name: z.string().min(1),
    sku: z.string().min(1),
    category: z.string().min(1),
    type: z.enum(['physical', 'digital', 'service', 'bundle']),
    costPrice: z.coerce.number().min(0),
    sellingPrice: z.coerce.number().min(0),
  }),
  employees: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    role: z.string().min(1),
    department: z.string().min(1),
    status: z.string().optional(),
  }),
  projects: z.object({
    name: z.string().min(1),
    category: z.string().min(1),
    startDate: z.string().min(1),
    billable: z.coerce.boolean().optional(),
  }),
  tasks: z.object({
    title: z.string().min(1),
    projectId: z.string().min(1),
    status: z.string().optional(),
    priority: z.string().optional(),
  }),
  time_entries: z.object({
    userId: z.string().min(1),
    source: z.enum(['clock', 'manual', 'timer']),
    startAt: z.string().min(1),
    endAt: z.string().optional(),
    projectId: z.string().optional(),
  }),
};

const duplicateFieldByEntity: Record<ImportEntity, string | null> = {
  clients: 'email',
  invoices: 'invoiceNumber',
  products: 'sku',
  employees: 'email',
  projects: 'name',
  tasks: null,
  time_entries: null,
};

function normalizeHeader(value: string): string {
  return value.trim().replace(/^"|"$/g, '').toLowerCase();
}

function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow || headerRow.length === 0) return [];

  const headers = headerRow.map(normalizeHeader);

  return dataRows
    .filter((dataRow) => dataRow.some((cell) => String(cell || '').trim().length > 0))
    .map((dataRow) => {
      const out: Record<string, string> = {};
      headers.forEach((header, index) => {
        out[header] = String(dataRow[index] ?? '').trim();
      });
      return out;
    });
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseExcelXml(content: string): Record<string, string>[] {
  const rows = [...content.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/gi)].map((match) => match[1]);
  if (!rows.length) return [];

  const cellsByRow = rows.map((rowXml) => {
    const cells = [...rowXml.matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/gi)].map((match) =>
      decodeXmlText(match[1]),
    );
    return cells;
  });

  const [headerRow, ...dataRows] = cellsByRow;
  const headers = (headerRow || []).map(normalizeHeader);

  return dataRows
    .filter((dataRow) => dataRow.some((cell) => String(cell || '').trim().length > 0))
    .map((dataRow) => {
      const out: Record<string, string> = {};
      headers.forEach((header, index) => {
        out[header] = String(dataRow[index] ?? '').trim();
      });
      return out;
    });
}

function detectFormat(fileName: string, mimeType?: string): ImportFileFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || mimeType === 'text/csv') return 'csv';
  if (lower.endsWith('.xml') || lower.endsWith('.xls') || mimeType === 'application/vnd.ms-excel')
    return 'excel_xml';
  throw new Error('Unsupported file format. Only CSV and Excel XML (.xml/.xls) are supported.');
}

function toEntityPayload(
  entity: ImportEntity,
  row: Record<string, unknown>,
  tenantId: string,
  userId: string,
) {
  const now = admin.firestore.Timestamp.now();
  const base = {
    tenantId,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };

  switch (entity) {
    case 'products':
      return {
        ...base,
        ...row,
        trackInventory: true,
        currentStock: Number(row.currentStock ?? 0),
        reorderPoint: Number(row.reorderPoint ?? 0),
        reorderQuantity: Number(row.reorderQuantity ?? 0),
        minStockLevel: Number(row.minStockLevel ?? 0),
        status: row.status ?? 'active',
      };
    case 'employees':
      return { ...base, ...row, status: row.status ?? 'Active' };
    case 'projects':
      return {
        ...base,
        ...row,
        status: row.status ?? 'planning',
        startDate: row.startDate ? new Date(String(row.startDate)) : null,
        billable: Boolean(row.billable ?? false),
        code: `PRJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      };
    default:
      return { ...base, ...row };
  }
}

export class BulkImportService {
  static async upload(params: {
    tenantId: string;
    userId: string;
    entity: ImportEntity;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    mappings: ImportFieldMapping[];
    templateId?: string | null;
  }) {
    const format = detectFormat(params.fileName, params.mimeType);
    const key = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${params.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const storagePath = `tenants/${params.tenantId}/imports/${params.entity}/${key}`;

    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
    await bucket.file(storagePath).save(params.buffer, {
      metadata: {
        contentType: params.mimeType,
      },
    });

    const nowIso = new Date().toISOString();
    const ref = await adminDb.collection('importJobs').add({
      tenantId: params.tenantId,
      entity: params.entity,
      fileName: params.fileName,
      format,
      storagePath,
      status: 'uploaded',
      progress: 0,
      totalRows: 0,
      processedRows: 0,
      createdBy: params.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
      mappings: params.mappings,
      errors: [],
      templateId: params.templateId ?? null,
    } satisfies Omit<ImportJob, 'id'>);

    return ref.id;
  }

  static async parseJobFile(job: ImportJob): Promise<Record<string, string>[]> {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
    const [buffer] = await bucket.file(job.storagePath).download();
    const content = buffer.toString('utf8');

    if (job.format === 'csv') return parseCsv(content);
    return parseExcelXml(content);
  }

  static mapRow(
    rawRow: Record<string, string>,
    mappings: ImportFieldMapping[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const raw = rawRow[normalizeHeader(mapping.sourceColumn)] ?? '';
      if (!raw) {
        result[mapping.destinationField] = undefined;
        continue;
      }

      switch (mapping.transform) {
        case 'number':
          result[mapping.destinationField] = Number(raw);
          break;
        case 'boolean':
          result[mapping.destinationField] = ['true', '1', 'yes'].includes(
            String(raw).toLowerCase(),
          );
          break;
        case 'date':
          result[mapping.destinationField] = new Date(raw).toISOString();
          break;
        default:
          result[mapping.destinationField] = raw;
      }
    }

    return result;
  }

  static async validateJob(params: {
    jobId: string;
    tenantId: string;
    mappings?: ImportFieldMapping[];
  }) {
    const jobRef = adminDb.collection('importJobs').doc(params.jobId);
    const snapshot = await jobRef.get();
    if (!snapshot.exists) throw new Error('Import job not found');

    const job = { id: snapshot.id, ...(snapshot.data() as Omit<ImportJob, 'id'>) };
    if (job.tenantId !== params.tenantId) throw new Error('Forbidden');

    const mappings = params.mappings && params.mappings.length ? params.mappings : job.mappings;
    if (!mappings.length) throw new Error('Field mappings are required');

    await jobRef.update({ status: 'validating', updatedAt: new Date().toISOString(), mappings });

    const rows = await this.parseJobFile(job as ImportJob);
    const schema = entitySchemas[job.entity];
    const errors: ImportRowError[] = [];
    const duplicateField = duplicateFieldByEntity[job.entity];
    const seen = new Set<string>();

    for (let index = 0; index < rows.length; index += 1) {
      const mapped = this.mapRow(rows[index], mappings);
      const rowNumber = index + 2;

      for (const mapping of mappings.filter((item) => item.required)) {
        if (!mapped[mapping.destinationField]) {
          errors.push({
            row: rowNumber,
            field: mapping.destinationField,
            code: 'MISSING_REQUIRED',
            message: `${mapping.destinationField} is required`,
          });
        }
      }

      const parsed = schema.safeParse(mapped);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          errors.push({
            row: rowNumber,
            field: String(issue.path[0] || ''),
            code: 'VALIDATION',
            message: issue.message,
          });
        });
      }

      if (duplicateField && mapped[duplicateField]) {
        const key = String(mapped[duplicateField]).toLowerCase();
        if (seen.has(key)) {
          errors.push({
            row: rowNumber,
            field: duplicateField,
            code: 'DUPLICATE',
            message: `Duplicate ${duplicateField} in file`,
          });
        }
        seen.add(key);
      }
    }

    if (duplicateField) {
      const uniqueValues = [...seen.values()];
      const existingSet = new Set<string>();

      for (let i = 0; i < uniqueValues.length; i += 10) {
        const chunk = uniqueValues.slice(i, i + 10);
        if (!chunk.length) continue;
        const existing = await adminDb
          .collection(job.entity)
          .where('tenantId', '==', params.tenantId)
          .where(duplicateField, 'in', chunk)
          .get();
        existing.docs.forEach((doc) => {
          existingSet.add(String(doc.data()?.[duplicateField] || '').toLowerCase());
        });
      }

      rows.forEach((row, index) => {
        const mapped = this.mapRow(row, mappings);
        const value = String(mapped[duplicateField] || '').toLowerCase();
        if (value && existingSet.has(value)) {
          errors.push({
            row: index + 2,
            field: duplicateField,
            code: 'DUPLICATE',
            message: `${duplicateField} already exists`,
            value,
          });
        }
      });
    }

    await jobRef.update({
      status: 'validated',
      totalRows: rows.length,
      errors,
      updatedAt: new Date().toISOString(),
    });

    return { totalRows: rows.length, errors };
  }

  static async processJob(params: {
    jobId: string;
    tenantId: string;
    userId: string;
    rollbackOnCritical?: boolean;
  }) {
    const rollbackOnCritical = params.rollbackOnCritical ?? true;
    const jobRef = adminDb.collection('importJobs').doc(params.jobId);
    const snapshot = await jobRef.get();
    if (!snapshot.exists) throw new Error('Import job not found');
    const job = { id: snapshot.id, ...(snapshot.data() as Omit<ImportJob, 'id'>) } as ImportJob;

    if (job.tenantId !== params.tenantId) throw new Error('Forbidden');

    const rows = await this.parseJobFile(job);
    const schema = entitySchemas[job.entity];
    const errors: ImportRowError[] = [...(job.errors || [])];
    const insertedDocIds: string[] = [];
    let inserted = 0;
    let duplicates = 0;

    await jobRef.update({
      status: 'processing',
      processedRows: 0,
      progress: 0,
      updatedAt: new Date().toISOString(),
    });

    try {
      for (let i = 0; i < rows.length; i += 1) {
        const mapped = this.mapRow(rows[i], job.mappings);
        const parsed = schema.safeParse(mapped);
        const rowNumber = i + 2;

        if (!parsed.success) {
          parsed.error.issues.forEach((issue) => {
            errors.push({
              row: rowNumber,
              field: String(issue.path[0] || ''),
              code: 'VALIDATION',
              message: issue.message,
            });
          });
        } else {
          const duplicateField = duplicateFieldByEntity[job.entity];
          let isDuplicate = false;

          if (duplicateField && parsed.data[duplicateField]) {
            const existing = await adminDb
              .collection(job.entity)
              .where('tenantId', '==', params.tenantId)
              .where(duplicateField, '==', parsed.data[duplicateField])
              .limit(1)
              .get();
            if (!existing.empty) {
              duplicates += 1;
              isDuplicate = true;
              errors.push({
                row: rowNumber,
                field: duplicateField,
                code: 'DUPLICATE',
                message: `${duplicateField} already exists`,
              });
            }
          }

          if (!isDuplicate) {
            const docRef = adminDb.collection(job.entity).doc();
            await docRef.set(
              toEntityPayload(job.entity, parsed.data, params.tenantId, params.userId),
            );
            insertedDocIds.push(docRef.id);
            inserted += 1;
          }
        }

        const processedRows = i + 1;
        await jobRef.update({
          processedRows,
          progress: Math.round((processedRows / rows.length) * 100),
          updatedAt: new Date().toISOString(),
        });
      }

      if (errors.length > 0 && rollbackOnCritical) {
        for (const docId of insertedDocIds) {
          await adminDb.collection(job.entity).doc(docId).delete();
        }
        await jobRef.update({
          status: 'rolled_back',
          errors,
          summary: { inserted: 0, failed: errors.length, duplicates },
          updatedAt: new Date().toISOString(),
        });
        return { status: 'rolled_back', inserted: 0, errors, duplicates };
      }

      await jobRef.update({
        status: 'completed',
        errors,
        summary: { inserted, failed: errors.length, duplicates },
        processedRows: rows.length,
        progress: 100,
        updatedAt: new Date().toISOString(),
      });

      return { status: 'completed', inserted, errors, duplicates };
    } catch (error) {
      for (const docId of insertedDocIds) {
        await adminDb.collection(job.entity).doc(docId).delete();
      }
      await jobRef.update({
        status: 'failed',
        errors: [
          ...errors,
          {
            row: 0,
            code: 'SYSTEM',
            message: error instanceof Error ? error.message : 'Import failed',
          },
        ],
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
