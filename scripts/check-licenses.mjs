import fs from 'node:fs/promises';
import path from 'node:path';

const NODE_MODULES_DIR = path.resolve('node_modules');
const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
]);

/**
 * Reads package licenses from installed modules.
 * @returns {Promise<Map<string, string>>}
 */
async function collectLicenses() {
  const packages = new Map();
  const scopesOrPackages = await fs.readdir(NODE_MODULES_DIR, { withFileTypes: true });

  for (const entry of scopesOrPackages) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name.startsWith('@')) {
      const scopeEntries = await fs.readdir(path.join(NODE_MODULES_DIR, entry.name), {
        withFileTypes: true,
      });
      for (const scopedPkg of scopeEntries) {
        if (!scopedPkg.isDirectory()) {
          continue;
        }
        await addPackage(packages, path.join(NODE_MODULES_DIR, entry.name, scopedPkg.name));
      }
      continue;
    }

    await addPackage(packages, path.join(NODE_MODULES_DIR, entry.name));
  }

  return packages;
}

/**
 * @param {Map<string, string>} store
 * @param {string} pkgDir
 */
async function addPackage(store, pkgDir) {
  const pkgJsonPath = path.join(pkgDir, 'package.json');

  try {
    const raw = await fs.readFile(pkgJsonPath, 'utf8');
    const pkg = JSON.parse(raw);
    const license = typeof pkg.license === 'string' ? pkg.license : 'UNSPECIFIED';
    store.set(`${pkg.name}@${pkg.version}`, license);
  } catch {
    // ignored for non-package directories
  }
}

async function main() {
  try {
    await fs.access(NODE_MODULES_DIR);
  } catch {
    throw new Error('node_modules not found. Run `npm ci` before license checks.');
  }

  const packages = await collectLicenses();
  const blocked = [];

  for (const [name, license] of packages) {
    if (!ALLOWED_LICENSES.has(license)) {
      blocked.push(`${name} => ${license}`);
    }
  }

  if (blocked.length) {
    throw new Error(`License compliance failed for ${blocked.length} packages:\n${blocked.join('\n')}`);
  }

  process.stdout.write(`License compliance passed for ${packages.size} packages.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
