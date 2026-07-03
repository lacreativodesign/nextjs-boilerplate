import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const apiDir = path.join(repoRoot, 'app', 'api');
const permissionsPath = path.join(repoRoot, 'app', 'lib', 'permissions.ts');

function findRouteFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findRouteFiles(fullPath, results);
    } else if (entry.isFile() && entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

function toImportPath(fromFile) {
  const fromDir = path.dirname(fromFile);
  let relativePath = path.relative(fromDir, permissionsPath);
  relativePath = relativePath.replace(/\\/g, '/');
  relativePath = relativePath.replace(/\.ts$/, '');
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

const routeFiles = findRouteFiles(apiDir);
const changedFiles = [];

for (const file of routeFiles) {
  const contents = fs.readFileSync(file, 'utf8');
  if (!contents.includes('lib/permissions')) {
    continue;
  }

  const targetImport = toImportPath(file);
  const updated = contents.replace(
    /(from\s+["'])([^"']*lib\/permissions)(["'])/g,
    `$1${targetImport}$3`,
  );

  if (updated !== contents) {
    fs.writeFileSync(file, updated);
    changedFiles.push(path.relative(repoRoot, file));
  }
}

for (const file of changedFiles) {
  console.log(file);
}
