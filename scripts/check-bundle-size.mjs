import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUILD_MANIFEST_PATH = path.resolve('.next/build-manifest.json');
const APP_BUILD_MANIFEST_PATH = path.resolve('.next/app-build-manifest.json');

const MAX_MAIN_BUNDLE_KB = 200;
const MAX_ROUTE_BUNDLE_KB = 100;
const MAX_FIRST_LOAD_JS_KB = 300;

async function getJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function gzipSizeKb(relativeAssetPath) {
  const normalized = relativeAssetPath.startsWith('/')
    ? relativeAssetPath.slice(1)
    : relativeAssetPath;
  const diskPath = path.resolve('.next', normalized.replace(/^_next\//, ''));
  const file = await fs.readFile(diskPath);
  return gzipSync(file, { level: 9 }).length / 1024;
}

async function sumGzipSizeKb(assets) {
  const uniqueAssets = [...new Set(assets)];
  let total = 0;

  for (const asset of uniqueAssets) {
    total += await gzipSizeKb(asset);
  }

  return total;
}

async function evaluateBuildManifest() {
  const manifest = await getJson(BUILD_MANIFEST_PATH);
  const appManifest = await getJson(APP_BUILD_MANIFEST_PATH);

  const rootMainFiles = manifest.rootMainFiles ?? [];
  const mainBundleKb = await sumGzipSizeKb(rootMainFiles);

  const pages = Object.entries(manifest.pages ?? {});
  const appPages = Object.entries(appManifest.pages ?? {});

  const routeReports = [];

  for (const [route, assets] of [...pages, ...appPages]) {
    if (route.startsWith('/_') || route === '/404' || route === '/_error') continue;
    const routeKb = await sumGzipSizeKb(assets ?? []);
    routeReports.push({ route, kb: routeKb });
  }

  const violatingRoutes = routeReports.filter((route) => route.kb > MAX_ROUTE_BUNDLE_KB);
  const largestRoute = routeReports.reduce(
    (max, current) => (current.kb > max.kb ? current : max),
    { route: 'n/a', kb: 0 },
  );

  return {
    mainBundleKb,
    firstLoadJsKb: mainBundleKb,
    violatingRoutes,
    largestRoute,
    routeCount: routeReports.length,
  };
}

async function main() {
  try {
    await fs.access(BUILD_MANIFEST_PATH);
    await fs.access(APP_BUILD_MANIFEST_PATH);
  } catch {
    throw new Error(
      'Build manifests are missing. Run `npm run build` before checking bundle size.',
    );
  }

  const report = await evaluateBuildManifest();

  const violations = [];
  if (report.mainBundleKb > MAX_MAIN_BUNDLE_KB) {
    violations.push(
      `Main bundle ${report.mainBundleKb.toFixed(2)}KB exceeds ${MAX_MAIN_BUNDLE_KB}KB.`,
    );
  }
  if (report.firstLoadJsKb > MAX_FIRST_LOAD_JS_KB) {
    violations.push(
      `First Load JS ${report.firstLoadJsKb.toFixed(2)}KB exceeds ${MAX_FIRST_LOAD_JS_KB}KB.`,
    );
  }
  if (report.violatingRoutes.length > 0) {
    const topOffenders = report.violatingRoutes
      .sort((a, b) => b.kb - a.kb)
      .slice(0, 5)
      .map((route) => `${route.route}: ${route.kb.toFixed(2)}KB`)
      .join(', ');
    violations.push(`Route bundles above ${MAX_ROUTE_BUNDLE_KB}KB: ${topOffenders}.`);
  }

  if (violations.length > 0) {
    throw new Error(`Bundle size check failed. ${violations.join(' ')}`);
  }

  process.stdout.write(
    `Bundle size check passed. Main=${report.mainBundleKb.toFixed(2)}KB, FirstLoadJS=${report.firstLoadJsKb.toFixed(2)}KB, LargestRoute=${report.largestRoute.route} (${report.largestRoute.kb.toFixed(2)}KB), RoutesChecked=${report.routeCount}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
