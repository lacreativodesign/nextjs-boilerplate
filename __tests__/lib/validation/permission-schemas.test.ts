import fs from 'fs';
import path from 'path';
import { applyTemplateSchema, createRoleSchema } from '@/lib/validations/permission';

/**
 * SOC2 F-06 — schema validation on the permission surface.
 *
 * 254 of the 329 mutating routes that read a request body had no schema at all. The
 * permission routes are the sharpest case: they decide who can do what, and
 * `permissions/roles` shipped a hand-rolled check that tested
 * `Array.isArray(item.actions)` without inspecting the array's contents. An action
 * the permission engine cannot evaluate could therefore be persisted into a role
 * document, and nothing bounded the number of entries or the length of a name.
 *
 * The repository already had the answer: `lib/validations/` with `validateRequest`,
 * schemas and a passing test suite — adopted by 5 routes out of 329. This session
 * adopts it rather than introducing a second mechanism, which is the mistake the
 * audit-logging surface already made six times over.
 */

describe('createRoleSchema', () => {
  const valid = {
    name: 'Support agent',
    permissions: [{ module: 'crm', entity: 'lead', actions: ['read', 'update'] }],
  };

  it('accepts a well-formed role', () => {
    const parsed = createRoleSchema.parse(valid);
    expect(parsed.name).toBe('Support agent');
    expect(parsed.permissions[0].actions).toEqual(['read', 'update']);
  });

  it('rejects an action the permission engine cannot evaluate', () => {
    // The old hand-rolled check accepted this: it only asked whether `actions` was
    // an array, never what the array held.
    expect(() =>
      createRoleSchema.parse({
        ...valid,
        permissions: [{ module: 'crm', entity: 'lead', actions: ['sudo'] }],
      }),
    ).toThrow();
  });

  it('rejects arbitrary objects smuggled in as actions', () => {
    expect(() =>
      createRoleSchema.parse({
        ...valid,
        permissions: [{ module: 'crm', entity: 'lead', actions: [{ evil: true }] }],
      }),
    ).toThrow();
  });

  it('rejects unknown keys rather than spreading them into Firestore', () => {
    expect(() => createRoleSchema.parse({ ...valid, isTemplate: true })).toThrow();
    expect(() => createRoleSchema.parse({ ...valid, tenantId: 'other-tenant' })).toThrow();
  });

  it('bounds the size of what can be persisted', () => {
    expect(() => createRoleSchema.parse({ ...valid, name: 'x'.repeat(121) })).toThrow();
    expect(() =>
      createRoleSchema.parse({
        ...valid,
        permissions: Array.from({ length: 201 }, () => valid.permissions[0]),
      }),
    ).toThrow();
  });

  it('rejects an empty name, as the previous check did', () => {
    expect(() => createRoleSchema.parse({ ...valid, name: '   ' })).toThrow();
  });

  it('constrains field access to the levels the engine understands', () => {
    expect(() =>
      createRoleSchema.parse({
        ...valid,
        permissions: [
          { module: 'crm', entity: 'lead', actions: ['read'], fields: { email: 'admin' } },
        ],
      }),
    ).toThrow();
  });
});

describe('applyTemplateSchema', () => {
  it('requires a template key', () => {
    expect(() => applyTemplateSchema.parse({})).toThrow();
  });

  it('accepts an optional grant target', () => {
    const parsed = applyTemplateSchema.parse({ templateKey: 'accountant', userId: 'user_1' });
    expect(parsed.userId).toBe('user_1');
  });

  it('rejects unknown keys, including a tenant override', () => {
    expect(() =>
      applyTemplateSchema.parse({ templateKey: 'accountant', tenantId: 'other-tenant' }),
    ).toThrow();
  });
});

/**
 * Ratchet. Append only, exactly like the audit-trail one. A route on this list must
 * validate its body through a schema rather than casting it.
 */
const MUST_VALIDATE = [
  'app/api/permissions/roles/route.ts',
  'app/api/permissions/templates/apply/route.ts',
];

describe('schema validation coverage', () => {
  it.each(MUST_VALIDATE)('%s validates its request body', (rel) => {
    const source = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(source).toContain('validateRequest(');
    // A cast is not validation: `as { ... }` asserts a shape without checking it.
    expect(source).not.toMatch(/await request\.json\(\)\)\s*as\s*\{/);
  });

  it.each(MUST_VALIDATE)('%s surfaces validation failures as 400, not 500', (rel) => {
    const source = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    // validateRequest throws AppError with status 400; resolveErrorResponse is what
    // turns that into a 400 rather than the catch-all 500 these routes returned.
    expect(source).toContain('resolveErrorResponse(');
  });
});
