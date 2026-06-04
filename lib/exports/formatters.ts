import * as XLSX from "xlsx";

export function toCSV(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function toExcel(rows: string[][], sheetName: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function toPDF(rows: string[][], title: string): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);

  const head = rows.length > 0 ? [rows[0]] : [];
  const body = rows.length > 1 ? rows.slice(1) : [];

  autoTable(doc, { head, body, startY: 24 });

  return Buffer.from(doc.output("arraybuffer"));
}
