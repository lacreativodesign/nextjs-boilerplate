import * as fs from 'fs';
import * as path from 'path';

/**
 * SEC-02 (F6) — Truthful upload virus-scan status.
 *
 * Previously StorageService labelled every upload virusScanStatus='clean' when no scanner
 * endpoint was configured, a false security signal for a file that was never scanned. The
 * no-scanner path must now return the truthful 'unscanned', and the upload gate must reject
 * only genuinely bad outcomes ('infected' or a 'failed' scan) — not everything that is not
 * 'clean', which would have blocked the honest 'unscanned' status. Uploads still succeed when
 * no scanner is deployed; the stored record simply no longer lies about having been scanned.
 *
 * A download-time gate and async re-scan are a noted follow-up (they touch the share/serve
 * flow) and are out of scope here.
 */
const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('SEC-02: truthful upload virus-scan status', () => {
  const types = read('types/documents.ts');
  const service = read('lib/storage/storage-service.ts');

  it("VirusScanStatus includes the truthful 'unscanned' state", () => {
    const match = types.match(/export type VirusScanStatus\s*=\s*([^;]+);/);
    expect(match).not.toBeNull();
    const union = match![1];
    expect(union).toContain("'unscanned'");
    // The real scan results stay in the union too.
    expect(union).toContain("'infected'");
    expect(union).toContain("'failed'");
  });

  it("the no-scanner path returns 'unscanned', never a false 'clean'", () => {
    // The former false-clean line must be gone.
    expect(service).not.toContain("return 'clean'; // No scanner configured");
    expect(service).not.toMatch(/No scanner configured[^\n]*allow upload/);

    // scanFile's no-scanner branch now returns 'unscanned'.
    const idx = service.indexOf('DOCUMENT_VIRUS_SCAN_ENDPOINT');
    expect(idx).toBeGreaterThan(-1);
    const block = service.slice(idx, idx + 600);
    expect(block).toContain("return 'unscanned'");
    expect(block).not.toMatch(/return 'clean'/);
  });

  it("the upload gate blocks only 'infected'/'failed', not everything that isn't 'clean'", () => {
    // The old blanket `!== 'clean'` reject would have blocked the honest 'unscanned' upload.
    expect(service).not.toMatch(/virusScanStatus\s*!==\s*'clean'/);
    // The honest gate names the two genuinely bad outcomes.
    expect(service).toMatch(
      /virusScanStatus\s*===\s*'infected'\s*\|\|\s*virusScanStatus\s*===\s*'failed'/,
    );
  });
});
