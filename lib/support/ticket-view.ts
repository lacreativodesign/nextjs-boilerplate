import { supportScreenshotHref } from '@/lib/storage/download-hrefs';

/**
 * P0-07 — what a ticket document may reveal about its screenshot when it is sent to a
 * browser.
 *
 * Tickets filed before P0-07 carry `screenshotUrl`: a Firebase URL with a permanent
 * download token for a capture of a customer's screen. Tickets filed after carry
 * `screenshotPath`. Neither is safe to send anywhere — the first is a bearer credential
 * and the second is only useful to something that can sign it — so both are removed from
 * every ticket read, and the super-admin views get a same-origin route instead, which
 * re-checks super_admin on every click.
 */
type Locators = { screenshotUrl?: unknown; screenshotPath?: unknown };

export function withoutScreenshotLocators<T extends Record<string, unknown>>(
  data: T | undefined,
): Omit<T, keyof Locators> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { screenshotUrl, screenshotPath, ...rest } = (data || {}) as T & Locators;
  return rest;
}

/** The super-admin shape: no locators, plus a link to the authorized screenshot route. */
export function superAdminTicketView<T extends Record<string, unknown>>(
  id: string,
  data: T | undefined,
) {
  const source = (data || {}) as T & Locators & { hasScreenshot?: unknown };
  const hasScreenshot =
    source.hasScreenshot === true || Boolean(source.screenshotPath || source.screenshotUrl);
  return {
    ...withoutScreenshotLocators(source),
    hasScreenshot,
    screenshotHref: hasScreenshot ? supportScreenshotHref(id) : null,
  };
}
