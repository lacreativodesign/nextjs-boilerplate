import * as fs from 'fs';
import * as path from 'path';

/**
 * SEC-02b — Download-time virus-scan gate + ClamAV fallback wiring.
 *
 * The upload path refuses to STORE an 'infected' or 'failed' file, but that is not enough on
 * its own: a file can be flagged after storage (a scanner added or updated later, an async
 * re-scan), and several upload paths register a file record without going through the
 * upload-time gate at all. So the document download route now blocks a definitive 'infected'
 * verdict before issuing a signed URL. It deliberately does NOT block 'unscanned' / 'pending'
 * / 'failed' / 'clean', because most uploads are stored with no scanner deployed and blocking
 * those would break normal file access.
 *
 * Separately, scanFile now has a local ClamAV fallback (previously scanFileWithClamAv was dead
 * code): when no HTTP endpoint is set but DOCUMENT_VIRUS_SCAN_CLAMAV is enabled, it scans with
 * the local clamscan binary instead of returning 'unscanned'.
 */
const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('SEC-02b: download-time scan gate', () => {
  const route = read('app/api/documents/[id]/download/route.ts');

  it('blocks a download when the document is flagged infected, with a 403', () => {
    expect(route).toContain("document.virusScanStatus === 'infected'");
    expect(route).toContain('file_infected');
    const gateIdx = route.indexOf("document.virusScanStatus === 'infected'");
    const urlIdx = route.indexOf('StorageService.getDownloadUrl');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(urlIdx).toBeGreaterThan(gateIdx);
  });

  it('does NOT block unscanned/pending/failed/clean (only a definitive infected verdict)', () => {
    expect(route).not.toMatch(/virusScanStatus\s*!==\s*'clean'/);
    expect(route).not.toContain("virusScanStatus === 'unscanned'");
  });
});

describe('SEC-02b: ClamAV fallback wiring', () => {
  const service = read('lib/storage/storage-service.ts');

  it('scanFile falls back to local ClamAV when enabled and no HTTP endpoint is set', () => {
    expect(service).toContain('DOCUMENT_VIRUS_SCAN_CLAMAV');
    expect(service).toContain('this.scanFileWithClamAv(file, fileName)');
    const endpointIdx = service.indexOf('DOCUMENT_VIRUS_SCAN_ENDPOINT');
    const clamavIdx = service.indexOf('DOCUMENT_VIRUS_SCAN_CLAMAV');
    expect(endpointIdx).toBeGreaterThan(-1);
    expect(clamavIdx).toBeGreaterThan(endpointIdx);
  });

  it('still returns truthful unscanned when neither scanner is configured', () => {
    const idx = service.indexOf('DOCUMENT_VIRUS_SCAN_CLAMAV');
    const block = service.slice(idx, idx + 1200);
    expect(block).toContain("return 'unscanned'");
  });
});
