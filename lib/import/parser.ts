import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export type ParsedImportData = {
  headers: string[];
  rows: Record<string, unknown>[];
};

function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.filter((row) =>
    Object.values(row).some(
      (value) => value !== null && value !== undefined && String(value).trim() !== '',
    ),
  );
}

export async function parseFile(file: File): Promise<ParsedImportData> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    const csvText = await file.text();

    return new Promise<ParsedImportData>((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error(results.errors[0].message));
            return;
          }

          const rows = normalizeRows(results.data);
          const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
          resolve({ headers, rows });
        },
        error: (error: Error) => reject(error),
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return { headers: [], rows: [] };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const rows = normalizeRows(data);

    return {
      headers: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
      rows,
    };
  }

  throw new Error('Unsupported file type. Only CSV, XLSX, and XLS are supported.');
}
