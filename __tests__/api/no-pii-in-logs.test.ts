import * as fs from 'fs';
import * as path from 'path';

/**
 * S23 — no personal or secret data is written to the logs.
 *
 * A cron job logged the recipient's email address on every invoice it sent
 * (`[EMAIL] Sent invoice ... to ${clientEmail}`). Platform logs are retained, searchable, and
 * visible to anyone with deploy access, so an email address printed there is a standing PII
 * exposure — and it violated the project's own rule that email, uid, tokens and passwords must
 * never appear in a production log line.
 *
 * That single line is fixed. This test is what stops the next one: it scans every server file
 * for a console call that interpolates an email / token / password / secret / apiKey / uid
 * VALUE, and fails the build if one reappears.
 *
 * Scope and deliberate exemptions:
 *   - Only console.* calls are inspected.
 *   - `tenantId` is intentionally NOT treated as PII. It is an opaque workspace identifier with
 *     no personal information in it, and tracing cron/webhook work by tenant is legitimate and
 *     already relied upon.
 *   - Matching is on interpolated VALUES (`${...email...}`), not on the mere appearance of the
 *     word — so a log message like "invalid email format" is fine.
 */
const SENSITIVE = /\$\{[^}]*(email|token|password|secret|apikey|api_key|\buid\b|\.uid\b)[^}]*\}/i;

function isViolation(line: string): boolean {
  if (!/console\.(log|info|warn|error|debug)/.test(line)) return false;
  return SENSITIVE.test(line);
}

function walk(dir: string, acc: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
}

describe('S23: no PII or secrets in server logs', () => {
  const roots = ['app/api', 'lib'].map((r) => path.join(process.cwd(), r));

  it('no console call interpolates an email, token, password, secret, apiKey or uid', () => {
    const files: string[] = [];
    roots.forEach((root) => {
      if (fs.existsSync(root)) walk(root, files);
    });

    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (isViolation(line)) {
          offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}  ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('the invoice cron logs a non-PII identifier, not the recipient email', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/cron/generate-invoices/route.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\[EMAIL\] Sent invoice.*\$\{clientEmail\}/);
    expect(src).toContain('[EMAIL] Sent invoice ${invoice.invoiceNumber} (${invoice.id})');
  });
});
