import fs from 'fs';
import path from 'path';

/**
 * KEY-2 — a workspace can hold several API keys, so rotation has no downtime.
 *
 * A tenant had exactly one key, stored as a single `apiKeyHash` field on the tenant
 * document, and POST overwrote it. Rotating therefore meant an outage: the instant an
 * admin clicked Rotate, every request from their website began failing and kept failing
 * until somebody pasted the new key into the other system and redeployed it.
 *
 * The real cost is not the outage — it is that nobody rotates under those terms. A
 * credential that cannot be rotated safely does not get rotated at all, so a leaked key
 * stays live indefinitely. That is what this changes: create, deploy, revoke, with no
 * window where neither key works.
 *
 * The legacy root hash is still honoured on lookup. Every tenant created before this has
 * one, and breaking a live integration to tidy a schema would be the wrong trade.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const MODEL = 'lib/ingest/api-keys.ts';
const AUTH = 'lib/ingest/auth.ts';
const ROUTE = 'app/api/admin/settings/api-key/route.ts';
const PAGE = 'app/admin/settings/api-key/page.tsx';

describe('KEY-2: issuing a key never destroys an existing one', () => {
  const src = active(ROUTE);

  it('creates a new record instead of overwriting a field', () => {
    // `set({ apiKeyHash }, { merge: true })` on the tenant root was the outage.
    expect(src).toContain('createTenantApiKey(');
    expect(src).not.toMatch(/set\(\{ apiKeyHash: keyHash \}/);
  });

  it('returns the secret exactly once', () => {
    expect(src).toContain('apiKey: created.plaintext');
  });

  it('stores only a hash, so nobody can read a key back', () => {
    const model = active(MODEL);
    expect(model).toContain('keyHash: hashApiKey(plaintext)');
    expect(model).not.toMatch(/plaintext,\s*$/m);
  });

  it('lets an admin name a key, since a hash cannot be told apart from another', () => {
    expect(src).toContain("String(body?.name || '')");
    expect(read(PAGE)).toContain('Key name (e.g. WDD website)');
  });
});

describe('KEY-2: several keys authenticate at once', () => {
  const src = active(AUTH);

  it('looks a key up across workspaces', () => {
    expect(src).toContain('findActiveApiKey(keyHash)');
  });

  it('scopes the lookup when a tenant is named', () => {
    expect(src).toContain('findActiveApiKeyForTenant(headerTenantId, keyHash)');
  });

  it('still honours the legacy single key', () => {
    // Every tenant created before this has one. Breaking live integrations to tidy a
    // schema would be the wrong trade.
    expect(src).toContain('hashesMatch(tenantData.apiKeyHash, keyHash)');
    expect(src).toContain("where('apiKeyHash', '==', keyHash)");
  });

  it('prefers a real key record over the legacy hash', () => {
    // The record carries revocation and last-used state that the bare hash cannot.
    const scopedAt = src.indexOf('findActiveApiKeyForTenant');
    const legacyAt = src.indexOf('hashesMatch(tenantData.apiKeyHash');
    expect(scopedAt).toBeGreaterThan(-1);
    expect(legacyAt).toBeGreaterThan(scopedAt);
  });

  it('refuses a key whose workspace no longer exists', () => {
    const block = src.slice(src.indexOf('findActiveApiKey(keyHash)'));
    expect(block).toContain("error: 'invalid_tenant'");
  });
});

describe('KEY-2: a revoked key stops working and stays on the record', () => {
  const model = active(MODEL);
  const src = active(ROUTE);

  it('filters revoked keys out of every lookup', () => {
    const matches = model.match(/if \(record\.revokedAt\) continue;/g) || [];
    expect(matches.length).toBe(2);
  });

  it('revokes rather than deletes', () => {
    // The record is the only evidence a key existed, when it was last used and who
    // withdrew it — exactly what an incident review needs.
    expect(src).toContain('revokedAt: new Date().toISOString()');
    expect(src).toContain('revokedBy: auth.user.uid');
    expect(src).not.toMatch(/\.delete\(\)/);
  });

  it('cannot revoke a key belonging to another workspace', () => {
    // The reference is built from the session's tenant, and existence is checked first.
    expect(src).toContain('.doc(auth.user.tenantId)');
    expect(src).toMatch(/if \(!snap\.exists\)/);
  });

  it('never returns a revoked key to the screen', () => {
    expect(src).toContain('.filter((key) => !key.revokedAt)');
  });
});

describe('KEY-2: the screen makes safe rotation the obvious path', () => {
  const page = read(PAGE);

  it('lists the keys, so an admin knows what exists', () => {
    expect(page).toContain('keys.map(');
    expect(page).toContain('key.prefix');
  });

  it('shows last use, so an idle key can be revoked with confidence', () => {
    // Otherwise revocation is a guess about whether anything still depends on it.
    expect(page).toContain('last used');
    expect(page).toContain('never used');
  });

  it('offers Create rather than Rotate', () => {
    // "Rotate" described a destructive replace. Creating is additive and safe.
    expect(page).toContain('Create Key');
    expect(page).not.toContain("'Rotate Key'");
  });

  it('revokes one named key at a time', () => {
    expect(page).toContain('revoke(key.keyId)');
  });

  it('warns that revoking takes effect immediately', () => {
    expect(page).toContain('stop working immediately');
  });
});

describe('KEY-2: the lookup query is supported', () => {
  it('has a collection-group index on keyHash', () => {
    // The key-only path queries across every workspace's subcollection; Firestore rejects
    // a collection-group query without an explicit index, so without this every
    // authentication fails at runtime.
    const cfg = JSON.parse(read('firestore.indexes.json')) as {
      fieldOverrides?: Array<{
        collectionGroup: string;
        fieldPath: string;
        indexes: Array<{ queryScope?: string }>;
      }>;
    };
    const override = cfg.fieldOverrides?.find(
      (f) => f.collectionGroup === 'api_keys' && f.fieldPath === 'keyHash',
    );
    expect(override).toBeDefined();
    expect(override?.indexes.some((i) => i.queryScope === 'COLLECTION_GROUP')).toBe(true);
  });

  it('denormalises the tenant onto the key, avoiding a second read per call', () => {
    expect(active(MODEL)).toContain('tenantId: input.tenantId');
  });
});

describe('KEY-2: last-used tracking never costs a request', () => {
  const model = active(MODEL);
  const auth = active(AUTH);

  it('is fire-and-forget', () => {
    // A lead must not fail because a bookkeeping write did.
    expect(auth).toContain('void touchApiKey(');
    expect(auth).not.toContain('await touchApiKey(');
  });

  it('swallows its own failure', () => {
    const fn = model.slice(model.indexOf('export async function touchApiKey'));
    expect(fn).toContain('catch');
    expect(fn).toContain('[API_KEY] failed to stamp last used');
  });

  it('compares hashes in constant time', () => {
    expect(model).toContain('timingSafeEqual');
    expect(model).not.toMatch(/keyHash\s*===\s*/);
  });
});
