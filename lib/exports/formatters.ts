import ExcelJS from 'exceljs';

/**
 * S14: xlsx (SheetJS) was replaced with exceljs.
 *
 * The `xlsx` package on npm carries a high-severity advisory (prototype pollution and
 * ReDoS) and CANNOT be patched: SheetJS stopped publishing to the npm registry, so the
 * newest version available there is still the vulnerable one. There is no version to
 * upgrade to. exceljs is a maintained replacement with no critical or high advisories.
 *
 * exceljs writes asynchronously, so toExcel is now async. Its output is byte-compatible
 * for consumers: a real .xlsx Buffer.
 */
export function toCSV(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export async function toExcel(rows: string[][], sheetName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function toPDF(rows: string[][], title: string): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);

  const head = rows.length > 0 ? [rows[0]] : [];
  const body = rows.length > 1 ? rows.slice(1) : [];

  autoTable(doc, { head, body, startY: 24 });

  return Buffer.from(doc.output('arraybuffer'));
}
