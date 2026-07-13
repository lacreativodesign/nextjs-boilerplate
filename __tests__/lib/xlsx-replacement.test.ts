import * as fs from 'fs';
import * as path from 'path';
import { toExcel, toCSV } from '@/lib/exports/formatters';
import { parseFile } from '@/lib/import/parser';

/**
 * S14 — the `xlsx` (SheetJS) dependency is gone.
 *
 * `xlsx` carries a high-severity prototype-pollution / ReDoS advisory that CANNOT be
 * patched: SheetJS stopped publishing to npm, so the newest version on the registry is
 * still the vulnerable one. There is no version to upgrade to — the only remedy is to
 * remove it. It was the last unpatched high-severity advisory in the production tree.
 *
 * The exposure was real rather than theoretical: parseFile is called SERVER-SIDE from
 * /api/import/parse, so XLSX.read() was parsing attacker-supplied spreadsheet bytes inside
 * the application server.
 *
 * exceljs replaces it (no critical or high advisories). These tests exercise a genuine
 * write -> read round-trip through the production code paths, not just source strings.
 */
describe('S14: xlsx is no longer a dependency', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  it('is absent from dependencies', () => {
    expect(pkg.dependencies?.xlsx).toBeUndefined();
    expect(pkg.devDependencies?.xlsx).toBeUndefined();
  });

  it('exceljs is used instead', () => {
    expect(pkg.dependencies?.exceljs).toBeDefined();
  });

  it('no source file imports xlsx any more', () => {
    const roots = ['lib', 'app'];
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (/from ['"]xlsx['"]|require\(['"]xlsx['"]\)/.test(src)) {
            offenders.push(path.relative(process.cwd(), full));
          }
        }
      }
    }

    roots.forEach((r) => walk(path.join(process.cwd(), r)));
    expect(offenders).toEqual([]);
  });
});

/** Minimal File surface consumed by parseFile: name, arrayBuffer(), text(). */
function asFile(buffer: Buffer, name: string): File {
  return {
    name,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    text: async () => buffer.toString('utf8'),
  } as unknown as File;
}

describe('S14: spreadsheet write/read still behaves identically', () => {
  const ROWS = [
    ['Client', 'Amount', 'Status'],
    ['Acme Ltd', '1200', 'Paid'],
    ['Beta Inc', '450', 'Overdue'],
  ];

  it('toExcel produces a real xlsx buffer', async () => {
    const buffer = await toExcel(ROWS, 'Revenue');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // XLSX files are ZIP archives: they start with the local file header magic "PK\x03\x04".
    expect(buffer.subarray(0, 2).toString('utf8')).toBe('PK');
  });

  it('round-trips through parseFile with the same headers and rows', async () => {
    const buffer = await toExcel(ROWS, 'Revenue');

    // Mimic the server-side upload path: /api/import/parse hands parseFile a File.
    // jsdom's File polyfill has no arrayBuffer(), so supply the exact surface parseFile
    // consumes (name / arrayBuffer / text) rather than mocking the module under test.
    const parsed = await parseFile(asFile(buffer, 'report.xlsx'));

    expect(parsed.headers).toEqual(['Client', 'Amount', 'Status']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ Client: 'Acme Ltd', Status: 'Paid' });
    expect(parsed.rows[1]).toMatchObject({ Client: 'Beta Inc', Status: 'Overdue' });
  });

  it('still rejects an unsupported file type', async () => {
    await expect(parseFile(asFile(Buffer.from('nope'), 'evil.exe'))).rejects.toThrow(
      /Unsupported file type/,
    );
  });

  it('toCSV is unchanged', () => {
    expect(toCSV([['a', 'b"c']])).toBe('"a","b""c"');
  });
});
