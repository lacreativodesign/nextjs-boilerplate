/**
 * The rule that decides what `E2E_DEMO_PASSWORD` means, and the proof that every consumer
 * of it decides the same way.
 *
 * This suite exists because they did not. `lib/demo/seed.ts` wrote the password onto the
 * ten demo accounts after trimming it; `scripts/verify-golden-tenant-signin.mjs` sent it
 * raw; `e2e/helpers/auth.ts` trimmed it again. A secret pasted with a trailing newline was
 * therefore STORED trimmed and SENT raw, and the certification preflight rejected a
 * credential that was correctly configured in both stores — reporting
 * `INVALID_LOGIN_CREDENTIALS`, which Email Enumeration Protection makes indistinguishable
 * from an account that does not exist. Three gate runs were spent on it, and no amount of
 * re-entering the secret could have fixed it.
 *
 * So the equivalence below is the point of the file, not a bonus: any future consumer that
 * grows its own opinion about whitespace fails here rather than thirty minutes into a
 * deployment-backed run.
 */
import { requireDemoPassword as fromPolicy } from '@/lib/demo/password-policy.mjs';
import { requireDemoPassword as fromSeeder } from '@/lib/demo/seed';
import { readConfig } from '@/scripts/verify-golden-tenant-signin.mjs';

const VALID = 'a-secure-test-password';

describe('E2E_DEMO_PASSWORD policy', () => {
  it('returns a valid password byte-for-byte', () => {
    expect(fromPolicy({ E2E_DEMO_PASSWORD: VALID })).toBe(VALID);
  });

  it('fails closed when unset or empty', () => {
    expect(() => fromPolicy({})).toThrow(/E2E_DEMO_PASSWORD is required/);
    expect(() => fromPolicy({ E2E_DEMO_PASSWORD: '' })).toThrow(/E2E_DEMO_PASSWORD is required/);
  });

  it('rejects surrounding whitespace rather than silently trimming it', () => {
    // A trailing newline is what a paste into a settings field actually produces, and
    // neither GitHub's nor Vercel's UI renders it.
    for (const padded of [
      `${VALID}\n`,
      `${VALID} `,
      ` ${VALID}`,
      `\t${VALID}`,
      ` ${VALID} `,
      `${VALID}\r\n`,
    ]) {
      expect(() => fromPolicy({ E2E_DEMO_PASSWORD: padded })).toThrow(
        /leading or trailing whitespace/,
      );
    }
  });

  it('leaves internal spaces alone — a passphrase is a legitimate password', () => {
    const passphrase = 'correct horse battery staple';
    expect(fromPolicy({ E2E_DEMO_PASSWORD: passphrase })).toBe(passphrase);
  });

  it('keeps the approved strength floor, measured on the configured value', () => {
    expect(() => fromPolicy({ E2E_DEMO_PASSWORD: 'fifteen-chars-x' })).toThrow(/at least 16/);
    expect(fromPolicy({ E2E_DEMO_PASSWORD: 'sixteen-chars-ok' })).toBe('sixteen-chars-ok');
    // Whitespace is refused before length, so padding can neither pad a short password up
    // to the floor nor be blamed for a genuinely short one.
    expect(() => fromPolicy({ E2E_DEMO_PASSWORD: '  short  ' })).toThrow(
      /leading or trailing whitespace/,
    );
  });

  it('never puts the value, its length, or anything derived from it in the message', () => {
    for (const bad of [`${VALID}\n`, 'short', '']) {
      try {
        fromPolicy({ E2E_DEMO_PASSWORD: bad });
        throw new Error(`expected a rejection for ${JSON.stringify(bad)}`);
      } catch (error) {
        const message = (error as Error).message;
        expect(message).not.toContain(VALID);
        expect(message).not.toContain('short');
        expect(message).not.toContain(String(bad.length));
      }
    }
  });
});

/**
 * The seeder writes the password; the preflight and the browser send it. If they disagree
 * about a single input, the fixture and the suite are using different bytes.
 */
describe('every consumer applies the identical rule', () => {
  const CASES: Array<[label: string, value: string | undefined]> = [
    ['a valid password', VALID],
    ['unset', undefined],
    ['empty', ''],
    ['trailing newline', `${VALID}\n`],
    ['trailing space', `${VALID} `],
    ['leading space', ` ${VALID}`],
    ['both ends padded', ` ${VALID} `],
    ['too short', 'fifteen-chars-x'],
    ['exactly at the floor', 'sixteen-chars-ok'],
    ['internal spaces', 'correct horse battery staple'],
  ];

  /** Accepted -> the exact string returned; rejected -> null. Never the reason. */
  const decide = (run: () => string): string | null => {
    try {
      return run();
    } catch {
      return null;
    }
  };

  it.each(CASES)('seeder and preflight agree on %s', (_label, value) => {
    const env = value === undefined ? {} : { E2E_DEMO_PASSWORD: value };
    const expected = decide(() => fromPolicy(env));

    expect(decide(() => fromSeeder(env))).toBe(expected);

    // readConfig carries the password through to the sign-in request, so its verdict is
    // what the deployment actually receives.
    expect(decide(() => readConfig({ ...env, BASE_URL: 'https://example.test' }).password)).toBe(
      expected,
    );
  });

  it('the seeder re-exports the shared policy rather than reimplementing it', () => {
    expect(fromSeeder).toBe(fromPolicy);
  });
});
