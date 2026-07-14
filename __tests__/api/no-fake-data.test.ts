import * as fs from 'fs';
import * as path from 'path';

/**
 * S16 — no page renders fabricated customer data.
 *
 * /sales/clients shipped a hardcoded list of three invented people — fabricated names,
 * companies, emails and phone numbers — rendered identically for EVERY tenant, with a caption
 * admitting they were placeholder records. A sales rep in a live workspace opened Clients and
 * saw customers who do not exist. That is a credibility and data-trust failure, not a
 * cosmetic one.
 *
 * The page now loads real clients. `sales` was previously not even permitted to call the
 * clients list API, which is why the fake page existed at all; the role is now allowed and
 * scoped to the clients it owns.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S16: the sales clients page shows real data', () => {
  const page = read('app/sales/clients/page.tsx');

  it('fetches from the clients API instead of hardcoding rows', () => {
    expect(page).toContain('/api/admin/clients/list');
    expect(page).toContain('apiFetch(');
  });

  it('contains none of the invented demo records', () => {
    ['Carter Studios', 'Silver Peak', 'BlueBrick', 'John Carter', 'Amelia Lopez'].forEach(
      (fake) => expect(page).not.toContain(fake),
    );
    expect(page).not.toMatch(/\+1 555/);
  });

  it('no longer tells the user the data is fake', () => {
    expect(page).not.toMatch(/demo clients/i);
    expect(page).not.toMatch(/until Firebase is connected/i);
  });

  it('handles loading, empty and error states honestly', () => {
    expect(page).toContain('Loading clients');
    expect(page).toContain('No clients are assigned to you yet');
    expect(page).toMatch(/Could not load clients/);
  });
});

describe('S16: the clients API scopes a sales rep to their own clients', () => {
  const route = read('app/api/admin/clients/list/route.ts');

  it('permits the sales role', () => {
    expect(route).toMatch(/r === 'sales'/);
  });

  it('filters a sales rep to the clients they own', () => {
    expect(route).toContain("query.where('salesOwner', '==', ownerName)");
  });

  it('fails closed: an unidentifiable rep sees nothing, not everything', () => {
    expect(route).toContain('if (!ownerName)');
    expect(route).toMatch(/clients: \[\]/);
  });

  it('still scopes every query to the tenant', () => {
    expect(route).toContain("where('tenantId', '==', me.tenantId)");
  });

  it('does not widen access for any other role', () => {
    expect(route).toMatch(/ownsOnly\(role\)/);
  });
});

describe('S17: the sales charts and reports show real numbers', () => {
  const analytics = read('app/sales/analytics/page.tsx');
  const reports = read('app/sales/reports/page.tsx');

  it('both pages load the real pipeline instead of literal arrays', () => {
    expect(analytics).toContain('/api/sales/pipeline');
    expect(reports).toContain('/api/sales/pipeline');
  });

  it('the invented revenue trend is gone', () => {
    // Was a literal series climbing 12000 -> 25000, identical for every tenant.
    expect(analytics).not.toMatch(/value:\s*12000/);
    expect(analytics).not.toMatch(/value:\s*25000/);
    expect(analytics).not.toMatch(/month:\s*'Jan'/);
  });

  it('the invented conversion funnel is gone', () => {
    expect(analytics).not.toMatch(/count:\s*45/);
    expect(analytics).not.toMatch(/stage:\s*'New',\s*count/);
  });

  it('the dummy deal list is gone', () => {
    expect(reports).not.toMatch(/Dummy deal/i);
    expect(reports).not.toContain('John Carter');
    expect(reports).not.toMatch(/id:\s*'D001'/);
  });

  it('both pages handle loading and empty states honestly', () => {
    expect(analytics).toContain('Loading analytics');
    expect(analytics).toMatch(/No deals yet/);
    expect(reports).toContain('Loading deals');
    expect(reports).toMatch(/No deals yet/);
  });
});

describe('S16: no user-facing page fabricates customer records', () => {
  it('no page under app/ contains placeholder demo data', () => {
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name === 'page.tsx') {
          const src = fs.readFileSync(full, 'utf8');
          if (/Placeholder demo|demo client list|until Firebase is connected/i.test(src)) {
            offenders.push(path.relative(process.cwd(), full));
          }
        }
      }
    }

    walk(path.join(process.cwd(), 'app'));
    expect(offenders).toEqual([]);
  });
});
