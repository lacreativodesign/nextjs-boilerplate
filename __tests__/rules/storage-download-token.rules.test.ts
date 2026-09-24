import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  createRealm,
  initStorageRulesEnv,
  STORAGE_EMULATOR,
  TENANT_A,
  type Principal,
} from './helpers/emulator';

/**
 * P0-07 — Firebase download-token semantics, EXECUTED rather than assumed.
 *
 * The P0-07 architecture rests on three facts about the Firebase Storage API. None of
 * them is written down in one place, and a wrong guess about any of them would leave a
 * permanent bearer URL on protected tenant files while the code looked correct. So each
 * one is demonstrated here against the pinned Storage emulator, which implements the
 * same `/v0` Firebase API the browser SDK talks to in production:
 *
 *   1. A browser upload through the Firebase SDK gets a `firebaseStorageDownloadTokens`
 *      token WITHOUT asking for one. Removing getDownloadURL() from the client does not
 *      stop tokens existing — the server has to strip them (lib/storage/download-tokens.ts).
 *
 *   2. A metadata GET through the Firebase API — what getDownloadURL() does — MINTS a
 *      fresh token on an object that has none, for any caller the rules let READ. So a
 *      stripped token grows back unless browser READ is denied.
 *
 *   3. With READ denied (storage.rules, P0-07), that same call is refused BEFORE a token
 *      is minted, and the object stays token-free.
 *
 * Token state is observed through the Cloud Storage JSON API (`/storage/v1`), which is
 * what the Admin SDK and the P0-07 inventory use. That path never mints — only the
 * Firebase `/v0` path does — so observing cannot change the thing being observed.
 *
 * WHAT THIS FILE CANNOT PROVE, stated so the evidence is not overstated: the emulator
 * keeps tokens in a field of its own and re-serialises them into the custom metadata on
 * every read, so a JSON-API PATCH that sets `firebaseStorageDownloadTokens` to null does
 * NOT remove them here, although in Cloud Storage that key is ordinary custom metadata.
 * The strip path is therefore certified by unit tests that fail closed unless the
 * post-patch metadata proves the token is gone, and by the live token inventory
 * (scripts/verify-storage-bucket.mjs) after merge — not by this suite.
 */

const TINY = new Uint8Array([0x50, 0x30, 0x37, 0x0a]);

const PRINCIPALS = {
  alphaAm: { uid: 'u-alpha-am', claims: { role: 'am', tenantId: TENANT_A } },
  alphaAdmin: { uid: 'u-alpha-admin', claims: { role: 'admin', tenantId: TENANT_A } },
  alphaHr: { uid: 'u-alpha-hr', claims: { role: 'hr', tenantId: TENANT_A } },
  alphaClient: { uid: 'u-alpha-client', claims: { role: 'client', tenantId: TENANT_A } },
  superAdmin: { uid: 'platform-operator', claims: { role: 'super_admin' } },
} satisfies Record<string, Principal>;

type PrincipalName = keyof typeof PRINCIPALS;

let env: RulesTestEnvironment;
let realm: ReturnType<typeof createRealm>;
let bucket = '';
let counter = 0;

const st = (name: PrincipalName) => realm.storage(name, PRINCIPALS[name]);
const fresh = (prefix: string) =>
  `tenants/${TENANT_A}/${prefix}/p0-07/${(counter += 1)}-${Date.now()}.bin`;

const JSON_API = () => `http://${STORAGE_EMULATOR.host}:${STORAGE_EMULATOR.port}`;

/**
 * Reads an object's custom metadata through the Cloud Storage JSON API with emulator
 * owner credentials — the Admin SDK's view. Never touches the Firebase `/v0` API.
 */
async function customMetadata(objectPath: string): Promise<Record<string, string>> {
  const res = await fetch(
    `${JSON_API()}/storage/v1/b/${bucket}/o/${encodeURIComponent(objectPath)}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (!res.ok) throw new Error(`metadata read failed: ${res.status}`);
  const body = (await res.json()) as { metadata?: Record<string, string> };
  return body.metadata ?? {};
}

const hasToken = async (objectPath: string) =>
  Boolean((await customMetadata(objectPath)).firebaseStorageDownloadTokens);

/**
 * Writes an object the way the Admin SDK does — a JSON-API multipart upload — which is
 * the one write path that does not attach a download token.
 */
async function adminWrite(objectPath: string): Promise<void> {
  const boundary = `p0-07-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        JSON.stringify({ name: objectPath, contentType: 'application/octet-stream' }) +
        `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    Buffer.from(TINY),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(
    `${JSON_API()}/upload/storage/v1/b/${bucket}/o?uploadType=multipart&name=${encodeURIComponent(objectPath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer owner',
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`admin write failed: ${res.status} ${await res.text()}`);
}

jest.setTimeout(120_000);

beforeAll(async () => {
  env = await initStorageRulesEnv();
  realm = createRealm(env);
  await env.clearStorage();
  bucket = st('alphaAm').ref('probe').bucket;
  if (!bucket) throw new Error('P0-07: could not resolve the emulator bucket name.');
});

afterAll(async () => {
  await env?.cleanup();
});

describe('P0-07 — fact 1: a browser upload is tokenized without being asked', () => {
  const UPLOADS: Array<{ prefix: string; uploader: PrincipalName }> = [
    { prefix: 'projects', uploader: 'alphaAm' },
    { prefix: 'client-files', uploader: 'alphaClient' },
    { prefix: 'employees', uploader: 'alphaAdmin' },
    { prefix: 'employee-documents', uploader: 'alphaHr' },
  ];

  it.each(UPLOADS)(
    '$prefix/** upload by $uploader carries firebaseStorageDownloadTokens',
    async ({ prefix, uploader }) => {
      const objectPath = fresh(prefix);
      // Exactly the product's call: uploadBytes(), no custom metadata, no getDownloadURL().
      await assertSucceeds(
        (async () => {
          await st(uploader).ref(objectPath).put(TINY);
        })(),
      );
      expect(await hasToken(objectPath)).toBe(true);
    },
  );

  it('an Admin-SDK-style write is NOT tokenized, so the inventory can tell them apart', async () => {
    const objectPath = fresh('projects');
    await adminWrite(objectPath);
    expect(await hasToken(objectPath)).toBe(false);
  });
});

describe('P0-07 — fact 2: a permitted Firebase READ re-mints a token on a token-free object', () => {
  it('getDownloadURL() on brand/** (still readable by the tenant) creates a token', async () => {
    // brand/** is the one tenant prefix that still grants browser READ. It is the control
    // case: same API, same object shape, READ allowed — and a token appears.
    const objectPath = `tenants/${TENANT_A}/brand/p0-07-${Date.now()}.webp`;
    await adminWrite(objectPath);
    expect(await hasToken(objectPath)).toBe(false);

    await assertSucceeds(st('alphaClient').ref(objectPath).getDownloadURL());

    expect(await hasToken(objectPath)).toBe(true);
  });
});

describe('P0-07 — fact 3: with READ denied, the protected prefixes cannot re-mint', () => {
  const CASES: Array<{ prefix: string; caller: PrincipalName }> = [
    // Each prefix's own uploader — the principal the old rules let READ — plus the
    // platform operator, which the old rules let READ on three of the four.
    { prefix: 'projects', caller: 'alphaAm' },
    { prefix: 'projects', caller: 'alphaAdmin' },
    { prefix: 'projects', caller: 'superAdmin' },
    { prefix: 'client-files', caller: 'alphaClient' },
    { prefix: 'employees', caller: 'alphaAdmin' },
    { prefix: 'employees', caller: 'superAdmin' },
    { prefix: 'employee-documents', caller: 'alphaHr' },
    { prefix: 'employee-documents', caller: 'superAdmin' },
  ];

  it.each(CASES)(
    '$prefix/** getDownloadURL() by $caller is refused and mints nothing',
    async ({ prefix, caller }) => {
      const objectPath = fresh(prefix);
      await adminWrite(objectPath);

      await assertFails(st(caller).ref(objectPath).getDownloadURL());
      await assertFails(st(caller).ref(objectPath).getMetadata());

      // The refusal happens before the mint: the object is still token-free.
      expect(await hasToken(objectPath)).toBe(false);
    },
  );

  it.each(CASES)(
    '$prefix/** is still writable by its uploader role (CREATE is unchanged)',
    async ({ prefix, caller }) => {
      // superAdmin is not a client-files uploader; every other caller in the table is the
      // prefix's uploader or holds its CREATE grant.
      const objectPath = fresh(prefix);
      await assertSucceeds(
        (async () => {
          await st(caller).ref(objectPath).put(TINY);
        })(),
      );
    },
  );
});
