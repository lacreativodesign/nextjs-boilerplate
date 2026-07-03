import { PassThrough } from 'stream';
import * as admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import type { ExportConfiguration, ExportJob, ImportEntity } from '@/types/import-export';

function toCsvValue(value: unknown) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildExcelXml(headers: string[], rows: string[][]) {
  const headerCells = headers
    .map((header) => `<Cell><Data ss:Type="String">${header}</Data></Cell>`)
    .join('');
  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${String(cell ?? '')}</Data></Cell>`).join('')}</Row>`,
    )
    .join('\n');

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Export"><Table>
<Row>${headerCells}</Row>
${bodyRows}
</Table></Worksheet>
</Workbook>`;
}

export class BulkExportService {
  static async createExportJob(params: {
    tenantId: string;
    userId: string;
    entity: ImportEntity;
    config: ExportConfiguration;
  }) {
    const nowIso = new Date().toISOString();
    const ref = await adminDb.collection('exportJobs').add({
      tenantId: params.tenantId,
      entity: params.entity,
      status: 'queued',
      format: params.config.format,
      fileName: '',
      totalRows: 0,
      processedRows: 0,
      createdBy: params.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
      fields: params.config.fields,
      filters: params.config.filters || [],
    } satisfies Omit<ExportJob, 'id'>);

    return ref.id;
  }

  static async runExportJob(params: { jobId: string; tenantId: string }) {
    const jobRef = adminDb.collection('exportJobs').doc(params.jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) throw new Error('Export job not found');

    const job = { id: jobSnap.id, ...(jobSnap.data() as Omit<ExportJob, 'id'>) } as ExportJob;
    if (job.tenantId !== params.tenantId) throw new Error('Forbidden');

    await jobRef.update({ status: 'processing', updatedAt: new Date().toISOString() });

    let query: FirebaseFirestore.Query = adminDb
      .collection(job.entity)
      .where('tenantId', '==', params.tenantId);

    for (const filter of job.filters || []) {
      if (filter.operator === 'eq') {
        query = query.where(filter.field, '==', filter.value);
      }
    }

    const pageSize = 500;
    const headers = job.fields.map((field) => field.label);
    const fieldKeys = job.fields.map((field) => field.sourceField);
    const csvLines: string[] = [];
    const excelRows: string[][] = [];

    let processedRows = 0;
    let totalRows = 0;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (true) {
      let pagedQuery = query.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
      if (lastDoc) pagedQuery = pagedQuery.startAfter(lastDoc);

      const snapshot = await pagedQuery.get();
      if (snapshot.empty) break;

      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const row = fieldKeys.map((key) => {
          const value = key === 'id' ? doc.id : data[key];
          if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
          if (Array.isArray(value) || (value && typeof value === 'object'))
            return JSON.stringify(value);
          return String(value ?? '');
        });

        csvLines.push(row.map(toCsvValue).join(','));
        excelRows.push(row);
        processedRows += 1;
      }

      totalRows += snapshot.size;
      await jobRef.update({ processedRows, totalRows, updatedAt: new Date().toISOString() });
    }

    const baseName = `${job.entity}-export-${Date.now()}`;
    const content =
      job.format === 'csv'
        ? `${headers.map(toCsvValue).join(',')}\n${csvLines.join('\n')}`
        : buildExcelXml(headers, excelRows);

    const extension = job.format === 'csv' ? 'csv' : 'xls';
    const fileName = `${baseName}.${extension}`;
    const storagePath = `tenants/${params.tenantId}/exports/${job.entity}/${fileName}`;

    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined;
    const bucket = bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();

    const outputStream = bucket.file(storagePath).createWriteStream({
      metadata: {
        contentType: job.format === 'csv' ? 'text/csv' : 'application/vnd.ms-excel',
      },
    });

    const source = new PassThrough();
    source.end(Buffer.from(content, 'utf8'));

    await new Promise<void>((resolve, reject) => {
      source.pipe(outputStream).on('finish', resolve).on('error', reject);
    });

    const [signedUrl] = await bucket
      .file(storagePath)
      .getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });

    await jobRef.update({
      status: 'completed',
      storagePath,
      signedUrl,
      fileName,
      totalRows,
      processedRows,
      updatedAt: new Date().toISOString(),
    });

    return { fileName, signedUrl, totalRows };
  }
}
