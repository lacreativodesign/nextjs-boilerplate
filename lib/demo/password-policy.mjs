/**
 * The one rule every consumer of `E2E_DEMO_PASSWORD` applies.
 *
 * WHY THIS EXISTS
 *
 * Three places read this variable, and they read it three different ways:
 *
 *   - `lib/demo/seed.ts` WRITES the password onto the ten demo accounts — it trimmed.
 *   - `scripts/verify-golden-tenant-signin.mjs` proves one account can sign in — it sent
 *     the value raw, and checked no length at all.
 *   - `e2e/helpers/auth.ts` types it thirteen times — it trimmed, and checked no length.
 *
 * A secret pasted with a trailing newline therefore had its TRIMMED form stored on the
 * accounts and its RAW form sent by the preflight. The preflight failed with
 * `INVALID_LOGIN_CREDENTIALS`, which Email Enumeration Protection makes identical to
 * "no such account" — so the gate reported a credential mismatch that did not exist, and
 * an operator who had correctly configured both stores had nothing to correct. Three
 * certification runs were spent on it.
 *
 * WHY IT REJECTS RATHER THAN TRIMS
 *
 * Trimming everywhere would also have worked, and it is the wrong fix. It means the value
 * an operator configured is silently not the value the system uses, so the two stores can
 * still hold different bytes while every consumer agrees — the same class of invisible
 * drift, moved somewhere harder to see. Rejecting surrounding whitespace and returning the
 * value byte-for-byte makes every consumer use the identical string by construction,
 * rather than by three implementations happening to agree.
 *
 * A rejection also says what to fix. `INVALID_LOGIN_CREDENTIALS` cannot.
 *
 * Nothing here logs the value, returns anything derived from it, or reports its length.
 * The messages describe the SHAPE of the configuration error and nothing about the secret.
 */

/** Minimum length for the shared demo password. Unchanged from the approved rule. */
export const MIN_DEMO_PASSWORD_LENGTH = 16;

/**
 * The configured golden tenant password, verbatim, or an error saying what to fix.
 *
 * Typed to the single key it reads rather than to `NodeJS.ProcessEnv`, so a caller — a
 * test especially — can hand it exactly that without fabricating a whole environment.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function requireDemoPassword(env = process.env) {
  const value = String(env.E2E_DEMO_PASSWORD ?? '');

  if (!value) {
    throw new Error('E2E_DEMO_PASSWORD is required for the golden tenant fixture and suite');
  }

  if (value !== value.trim()) {
    throw new Error(
      'E2E_DEMO_PASSWORD has leading or trailing whitespace. It is used exactly as ' +
        'configured, so re-enter it with no surrounding spaces and no trailing newline — ' +
        'in the GitHub Actions secret and in the deployment environment, from the same ' +
        'source. A pasted newline is the usual cause and neither settings page shows it.',
    );
  }

  if (value.length < MIN_DEMO_PASSWORD_LENGTH) {
    throw new Error(
      `E2E_DEMO_PASSWORD must be configured with at least ${MIN_DEMO_PASSWORD_LENGTH} characters`,
    );
  }

  return value;
}
