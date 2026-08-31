import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUILD_MANIFEST_PATH = path.resolve('.next/build-manifest.json');
const APP_BUILD_MANIFEST_PATH = path.resolve('.next/app-build-manifest.json');

// DS-33: these are independent budgets. The root shell is paid once, while a route budget
// measures only JavaScript owned by that route. Shared root/layout chunks are excluded from
// every route report instead of being charged hundreds of times. Each limit is a ratchet
// that may move down as code is split, never up to hide a regression.
const MAX_MAIN_BUNDLE_KB = 210;
const MAX_ROUTE_BUNDLE_KB = 100;
const MAX_FIRST_LOAD_JS_KB = 300;

async function getJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function isJavaScriptAsset(asset) {
  return typeof asset === 'string' && asset.endsWith('.js');
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
  const uniqueAssets = [...new Set(assets.filter(isJavaScriptAsset))];
  let total = 0;

  for (const asset of uniqueAssets) {
    total += await gzipSizeKb(asset);
  }

  return total;
}

function buildRouteAssetMap(manifest, appManifest) {
  const routeAssets = new Map();

  for (const [route, assets] of [
    ...Object.entries(manifest.pages ?? {}),
    ...Object.entries(appManifest.pages ?? {}),
  ]) {
    if (route.startsWith('/_') || route === '/404' || route === '/_error') continue;
    const existing = routeAssets.get(route) ?? new Set();
    for (const asset of assets ?? []) {
      if (isJavaScriptAsset(asset)) existing.add(asset);
    }
    routeAssets.set(route, existing);
  }

  return routeAssets;
}

function countRouteReferences(routeAssets) {
  const references = new Map();
  for (const assets of routeAssets.values()) {
    for (const asset of assets) references.set(asset, (references.get(asset) ?? 0) + 1);
  }
  return references;
}

async function evaluateBuildManifest() {
  const manifest = await getJson(BUILD_MANIFEST_PATH);
  const appManifest = await getJson(APP_BUILD_MANIFEST_PATH);

  const rootMainFiles = (manifest.rootMainFiles ?? []).filter(isJavaScriptAsset);
  const rootMainSet = new Set(rootMainFiles);
  const mainBundleKb = await sumGzipSizeKb(rootMainFiles);
  const routeAssets = buildRouteAssetMap(manifest, appManifest);
  const referenceCounts = countRouteReferences(routeAssets);

  const routeReports = [];

  for (const [route, assets] of routeAssets) {
    const routeOwnedAssets = [...assets].filter(
      (asset) => !rootMainSet.has(asset) && referenceCounts.get(asset) === 1,
    );
    const routeKb = await sumGzipSizeKb(routeOwnedAssets);
    routeReports.push({ route, kb: routeKb, assets: routeOwnedAssets.length });
  }

  const violatingRoutes = routeReports.filter((route) => route.kb > MAX_ROUTE_BUNDLE_KB);
  const largestRoute = routeReports.reduce(
    (max, current) => (current.kb > max.kb ? current : max),
    { route: 'n/a', kb: 0, assets: 0 },
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
    violations.push(`Route-owned bundles above ${MAX_ROUTE_BUNDLE_KB}KB: ${topOffenders}.`);
  }

  if (violations.length > 0) {
    throw new Error(`Bundle size check failed. ${violations.join(' ')}`);
  }

  process.stdout.write(
    `Bundle size check passed. Main=${report.mainBundleKb.toFixed(2)}KB, FirstLoadJS=${report.firstLoadJsKb.toFixed(2)}KB, LargestRouteOwned=${report.largestRoute.route} (${report.largestRoute.kb.toFixed(2)}KB across ${report.largestRoute.assets} assets), RoutesChecked=${report.routeCount}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
