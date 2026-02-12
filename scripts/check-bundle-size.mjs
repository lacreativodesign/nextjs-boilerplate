import fs from 'node:fs/promises';
import path from 'node:path';

const CHUNKS_DIR = path.resolve('.next/static/chunks');
const MAX_KB = 3500;

/**
 * Computes total chunk size in kilobytes.
 * @returns {Promise<number>}
 */
async function getTotalChunkSizeKb() {
  const entries = await fs.readdir(CHUNKS_DIR, { withFileTypes: true });
  let bytes = 0;

  for (const entry of entries) {
    const fullPath = path.join(CHUNKS_DIR, entry.name);
    if (entry.isDirectory()) {
      continue;
    }
    const stats = await fs.stat(fullPath);
    bytes += stats.size;
  }

  return Math.round(bytes / 1024);
}

async function main() {
  try {
    await fs.access(CHUNKS_DIR);
  } catch {
    throw new Error('Bundle artifacts are missing. Run `npm run build` before checking bundle size.');
  }

  const totalKb = await getTotalChunkSizeKb();
  if (totalKb > MAX_KB) {
    throw new Error(`Bundle size check failed: ${totalKb}KB exceeds ${MAX_KB}KB threshold.`);
  }

  process.stdout.write(`Bundle size check passed: ${totalKb}KB <= ${MAX_KB}KB.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
