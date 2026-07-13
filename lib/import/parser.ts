import ExcelJS from 'exceljs';
import Papa from 'papaparse';

/**
 * S14: xlsx (SheetJS) was replaced with exceljs.
 *
 * This is the sharp end of that dependency. parseFile is called SERVER-SIDE from
 * /api/import/parse, so `XLSX.read()` was parsing attacker-supplied spreadsheet bytes
 * inside the application server. The `xlsx` package carries a high-severity prototype
 * pollution / ReDoS advisory and cannot be patched — SheetJS no longer publishes to npm,
 * so the newest registry version is still the vulnerable one.
 *
 * exceljs is a maintained replacement with no critical or high advisories. Output shape is
 * unchanged: the first worksheet, its header row, and one object per data row.
 */
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

/** Flattens exceljs cell values (which may be rich text, formula or hyperlink objects). */
function cellToPrimitive(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if ('text' in obj) return obj.text;
    if ('result' in obj) return obj.result;
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((part: { text?: string }) => part?.text ?? '').join('');
    }
    if ('hyperlink' in obj) return obj.hyperlink;
    return '';
  }
  return value;
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
    const arrayBuffer = await file.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    // Normalise to a Node Buffer. The underlying zip reader does instanceof checks that
    // fail on an ArrayBuffer originating from a different JS realm, which is exactly what
    // an uploaded File yields in some runtimes.
    await workbook.xlsx.load(Buffer.from(arrayBuffer));

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { headers: [], rows: [] };
    }

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cellToPrimitive(cell.value) ?? '').trim();
    });

    const data: Record<string, unknown>[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (!header) return;
        record[header] = cellToPrimitive(row.getCell(index + 1).value);
      });
      data.push(record);
    });

    const rows = normalizeRows(data);

    return {
      headers: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
      rows,
    };
  }

  throw new Error('Unsupported file type. Only CSV, XLSX, and XLS are supported.');
}
