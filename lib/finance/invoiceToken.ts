import { randomBytes } from 'crypto';

export function generateInvoiceToken(): string {
  return randomBytes(24).toString('hex'); // 48-char URL-safe token
}
