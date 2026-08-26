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
  // Reviewed additions (July 2026): permissive or weak-copyleft licenses that are
  // safe for a proprietary SaaS consuming them as unmodified npm dependencies.
  'MIT-0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CC-BY-4.0',
  'MPL-2.0',
  'LGPL-3.0-or-later',
  '(MPL-2.0 OR Apache-2.0)',
  '(MIT AND Zlib)',
  '(MIT OR CC0-1.0)',
  '(WTFPL OR MIT)',
  '(BSD-3-Clause OR GPL-2.0)',
  '(MIT OR GPL-3.0-or-later)',
  'MIT AND ISC',
  'MIT/X11',
]);

// Packages whose package.json lacks a parseable SPDX string but whose repos were
// reviewed and carry permissive terms. Keyed by bare name so version bumps do not
// re-break CI.
const REVIEWED_PACKAGE_EXCEPTIONS = new Set([
  'busboy',
  'config-chain',
  'exit',
  'limiter',
  'png-js',
  'streamsearch',
  'rgbcolor',
]);

// Exact-version exceptions are required when an old package omits SPDX
// metadata. Do not broaden these to a bare package name: a future artifact must
// be reviewed again. buffers@0.1.1 is MIT/X11; the published tarball omits the
// field, while the upstream release lineage and Debian source metadata retain
// the MIT terms.
const REVIEWED_PACKAGE_VERSION_EXCEPTIONS = new Set(['buffers@0.1.1']);

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
    const bareName = name.slice(0, name.lastIndexOf('@'));
    if (
      REVIEWED_PACKAGE_EXCEPTIONS.has(bareName) ||
      REVIEWED_PACKAGE_VERSION_EXCEPTIONS.has(name)
    ) {
      continue;
    }
    if (!ALLOWED_LICENSES.has(license)) {
      blocked.push(`${name} => ${license}`);
    }
  }

  if (blocked.length) {
    throw new Error(
      `License compliance failed for ${blocked.length} packages:\n${blocked.join('\n')}`,
    );
  }

  process.stdout.write(`License compliance passed for ${packages.size} packages.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
