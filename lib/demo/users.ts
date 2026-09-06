/**
 * Golden tenant identity constants.
 *
 * Split out of `lib/demo/seed.ts` so the Super Admin demo page — a client
 * component — can render the same roster the server seeds without pulling
 * `firebaseAdmin` into the browser bundle. Keeping one copy is what stops the
 * page and the seeder drifting apart.
 *
 * Nothing secret belongs in this file: the demo password is read from
 * `E2E_DEMO_PASSWORD` at seed time and never lives in source.
 */

export const DEMO_TENANT_ID = 'bizosto-demo';

/** The ten approved tenant roles seeded into the golden tenant. */
export const DEMO_USERS = [
  { email: 'demo_admin@bizosto.com', role: 'admin', name: 'Alex Admin' },
  { email: 'demo_sales@bizosto.com', role: 'sales', name: 'Sam Sales' },
  { email: 'demo_sales_manager@bizosto.com', role: 'sales_manager', name: 'Sarah Manager' },
  { email: 'demo_am@bizosto.com', role: 'am', name: 'Adam Account' },
  { email: 'demo_am_manager@bizosto.com', role: 'am_manager', name: 'Amy Head' },
  { email: 'demo_production@bizosto.com', role: 'production', name: 'Pete Production' },
  {
    email: 'demo_production_manager@bizosto.com',
    role: 'production_manager',
    name: 'Paula Manager',
  },
  { email: 'demo_finance@bizosto.com', role: 'finance', name: 'Frank Finance' },
  { email: 'demo_hr@bizosto.com', role: 'hr', name: 'Hannah HR' },
  { email: 'demo_client@bizosto.com', role: 'client', name: 'Chris Client' },
] as const;

export type DemoUser = (typeof DEMO_USERS)[number];
