'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LoadingButton from '@/components/ui/LoadingButton';
import { toastError, toastSuccess } from '@/lib/toast';
import { apiFetch } from '@/lib/api/client';
import type { SegmentDefinition } from '@/lib/segments';

type SalesStage =
  | 'New Lead'
  | 'Contacted'
  | 'Qualified'
  | 'Proposal Sent'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost';

type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Refunded';
type RetainerStatus = 'None' | 'Active' | 'Paused' | 'Cancelled';

type ClientRecord = {
  id: string;
  companyName: string;
  website?: string;
  industry?: string;
  businessType?: string;
  country?: string;
  city?: string;
  timezone?: string;
  employeeCountRange?: string | null;
  yearsInBusinessRange?: string | null;
  segmentServices?: string[];
  segmentIndustry?: string | null;
  segmentBusinessType?: string | null;
  segmentGeo?: string | null;

  primaryContactName: string;
  primaryContactTitle?: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;

  salesStage?: SalesStage | string;
  paymentStatus?: PaymentStatus | string;
  retainerStatus?: RetainerStatus | string;

  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;

  totalPaidUsd: number;

  createdAt?: string | null;
  updatedAt?: string | null;
  lastActivity?: string | null;
};

type ApiResp = { ok: true; clientId?: string } | { ok?: false; error?: string };

type SalesUser = {
  uid: string;
  name: string;
  role?: string;
};

type SalesUsersResp = { ok: true; users?: SalesUser[] } | { ok?: false; error?: string };

const COUNTRIES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Andorra',
  'Angola',
  'Antigua and Barbuda',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Colombia',
  'Comoros',
  'Congo (DRC)',
  'Congo (Republic)',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Fiji',
  'Finland',
  'France',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Grenada',
  'Guatemala',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Honduras',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kiribati',
  'Korea (North)',
  'Korea (South)',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Marshall Islands',
  'Mauritania',
  'Mauritius',
  'Mexico',
  'Micronesia',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nauru',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Palau',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'Sao Tome and Principe',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Africa',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Togo',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Tuvalu',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Vanuatu',
  'Vatican City',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
];

export default function AddClientPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [timezone, setTimezone] = useState('');
  const [employeeCountRange, setEmployeeCountRange] = useState('');
  const [yearsInBusinessRange, setYearsInBusinessRange] = useState('');
  const [segmentServices, setSegmentServices] = useState<string[]>([]);
  const [segmentIndustry, setSegmentIndustry] = useState('');
  const [segmentBusinessType, setSegmentBusinessType] = useState('');
  const [segmentGeo, setSegmentGeo] = useState('');

  const [segments, setSegments] = useState<SegmentDefinition[]>([]);

  const [primaryContactName, setPrimaryContactName] = useState('');
  const [primaryContactTitle, setPrimaryContactTitle] = useState('');
  const [primaryContactEmail, setPrimaryContactEmail] = useState('');
  const [primaryContactPhone, setPrimaryContactPhone] = useState('');

  const [salesOwner, setSalesOwner] = useState('');
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
  const [accountManager, setAccountManager] = useState('');
  const [amUsers, setAmUsers] = useState<SalesUser[]>([]);
  const [productionOwner, setProductionOwner] = useState('');
  const [productionUsers, setProductionUsers] = useState<SalesUser[]>([]);

  const [salesStage, setSalesStage] = useState<SalesStage>('New Lead');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Unpaid');
  const [retainerStatus, setRetainerStatus] = useState<RetainerStatus>('None');

  // ✅ keep value as string so we can avoid number spinner UI entirely
  const [totalPaidUsd, setTotalPaidUsd] = useState<string>('0');

  useEffect(() => {
    let alive = true;

    async function loadSegments() {
      try {
        const res = await apiFetch('/api/admin/clients/segments/list', {
          method: 'GET',
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) return;
        const list = Array.isArray(json?.segments) ? json.segments : [];
        if (!alive) return;
        setSegments(list);
      } catch {
        if (!alive) return;
        setSegments([]);
        toastError('Failed to load client segments.');
      }
    }

    async function loadSalesUsers() {
      try {
        const res = await apiFetch('/api/admin/users/by-role?role=sales', {
          method: 'GET',
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as SalesUsersResp;
        if (!res.ok || !json?.ok) return;
        const users = Array.isArray(json.users) ? json.users : [];
        if (!alive) return;
        setSalesUsers(users);
      } catch {
        if (!alive) return;
        setSalesUsers([]);
        toastError('Failed to load sales users.');
      }
    }

    async function loadAmUsers() {
      try {
        const res = await apiFetch('/api/admin/users/by-role?role=am,am_manager', {
          method: 'GET',
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as SalesUsersResp;
        if (!res.ok || !json?.ok) return;
        const users = Array.isArray(json.users) ? json.users : [];
        if (!alive) return;
        setAmUsers(users);
      } catch {
        if (!alive) return;
        setAmUsers([]);
        toastError('Failed to load account managers.');
      }
    }

    async function loadProductionUsers() {
      try {
        const res = await apiFetch('/api/admin/users/by-role?role=production', {
          method: 'GET',
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as SalesUsersResp;
        if (!res.ok || !json?.ok) return;
        const users = Array.isArray(json.users) ? json.users : [];
        if (!alive) return;
        setProductionUsers(users);
      } catch {
        if (!alive) return;
        setProductionUsers([]);
        toastError('Failed to load production users.');
      }
    }

    loadSegments();
    loadSalesUsers();
    loadAmUsers();
    loadProductionUsers();
    return () => {
      alive = false;
    };
  }, []);

  const segmentsByType = useMemo(() => {
    const grouped: Record<string, SegmentDefinition[]> = {};
    segments.forEach((segment) => {
      if (!grouped[segment.type]) grouped[segment.type] = [];
      grouped[segment.type].push(segment);
    });
    return grouped;
  }, [segments]);

  const segmentLookup = useMemo(() => {
    const map: Record<string, SegmentDefinition> = {};
    segments.forEach((segment) => {
      map[segment.slug] = segment;
    });
    return map;
  }, [segments]);

  const employeeRanges = ['1-5', '6-10', '11-25', '26-50', '51-100', '101-250', '251-500', '500+'];

  const yearsRanges = ['<1', '1-3', '4-7', '8-12', '13-20', '20+'];

  const styles = useMemo(() => {
    const pageTitle: React.CSSProperties = {
      fontSize: 34,
      fontWeight: 900,
      marginBottom: 8,
      color: 'var(--text-primary)',
    };

    const pageSub: React.CSSProperties = {
      marginBottom: 18,
      color: 'var(--text-muted)',
      fontSize: 14,
      lineHeight: 1.5,
    };

    // full-width like Create User (NOT centered)
    const fullWidthWrap: React.CSSProperties = {
      width: '100%',
      maxWidth: 'none',
    };

    // KEY-ACCOUNTS master shell
    const formShell: React.CSSProperties = {
      borderRadius: 20,
      padding: 18,
      border: '1px solid var(--border-subtle)',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-md)',
    };

    // inner section surfaces MUST be grey in dark mode (not blue)
    const sectionCard: React.CSSProperties = {
      borderRadius: 16,
      padding: 14,
      border: '1px solid var(--border-subtle)',
      background: 'var(--surface-muted)',
    };

    const sectionTitle: React.CSSProperties = {
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      opacity: 0.72,
      marginBottom: 10,
      color: 'var(--text-muted)',
    };

    const label: React.CSSProperties = {
      fontSize: 11,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      fontWeight: 900,
      marginBottom: 6,
      color: 'var(--text-muted)',
    };

    const help: React.CSSProperties = {
      fontSize: 12,
      marginTop: 6,
      color: 'var(--text-muted)',
    };

    const actions: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 14,
    };

    const errorText: React.CSSProperties = {
      fontSize: 14,
      color: '#FCA5A5',
      marginBottom: 12,
    };

    const okText: React.CSSProperties = {
      fontSize: 14,
      color: 'var(--text-muted)',
      marginBottom: 12,
    };

    return {
      pageTitle,
      pageSub,
      fullWidthWrap,
      formShell,
      sectionCard,
      sectionTitle,
      label,
      help,
      actions,
      errorText,
      okText,
    };
  }, []);

  function toMoneyNumber(v: string) {
    const cleaned = (v || '').replace(/[^0-9.]/g, '');
    const n = Number(cleaned || 0);
    if (!Number.isFinite(n)) return 0;
    return n;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) return setError('Company name is required.');
    if (!primaryContactName.trim()) return setError('Primary contact name is required.');
    if (!primaryContactEmail.trim()) return setError('Primary contact email is required.');

    setLoading(true);
    try {
      const payload: Partial<ClientRecord> = {
        companyName: companyName.trim(),
        website: website.trim() || undefined,
        industry: (segmentLookup[segmentIndustry]?.name || industry).trim() || undefined,
        businessType:
          (segmentLookup[segmentBusinessType]?.name || businessType).trim() || undefined,
        country: country.trim() || undefined,
        city: city.trim() || undefined,
        timezone: timezone.trim() || undefined,
        employeeCountRange: employeeCountRange || undefined,
        yearsInBusinessRange: yearsInBusinessRange || undefined,
        segmentServices,
        segmentIndustry: segmentIndustry || undefined,
        segmentBusinessType: segmentBusinessType || undefined,
        segmentGeo: segmentGeo || undefined,

        primaryContactName: primaryContactName.trim(),
        primaryContactTitle: primaryContactTitle.trim() || undefined,
        primaryContactEmail: primaryContactEmail.trim(),
        primaryContactPhone: primaryContactPhone.trim() || undefined,

        salesOwner: salesOwner.trim() || undefined,
        accountManager: accountManager.trim() || undefined,
        productionOwner: productionOwner.trim() || undefined,

        salesStage,
        paymentStatus,
        retainerStatus,

        // ✅ no spinner UI, still stored as number
        totalPaidUsd: toMoneyNumber(totalPaidUsd),
      };

      const res = await apiFetch('/api/admin/clients/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as ApiResp;
      if (!res.ok || !('ok' in json) || !json.ok) {
        const message = 'error' in json ? json.error : undefined;
        throw new Error(message || 'Failed to create client');
      }

      toastSuccess('Saved successfully.');
      setTimeout(() => router.push('/admin/clients'), 800);

      // reset
      setCompanyName('');
      setWebsite('');
      setIndustry('');
      setBusinessType('');
      setCountry('');
      setCity('');
      setTimezone('');
      setEmployeeCountRange('');
      setYearsInBusinessRange('');
      setSegmentServices([]);
      setSegmentIndustry('');
      setSegmentBusinessType('');
      setSegmentGeo('');

      setPrimaryContactName('');
      setPrimaryContactTitle('');
      setPrimaryContactEmail('');
      setPrimaryContactPhone('');

      setSalesOwner('');
      setAccountManager('');
      setProductionOwner('');

      setSalesStage('New Lead');
      setPaymentStatus('Unpaid');
      setRetainerStatus('None');

      setTotalPaidUsd('0');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create client';
      setError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.fullWidthWrap}>
      <Link
        href="/admin/crm"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--erp-blue)] hover:underline mb-4 block"
      >
        ← Back to CRM
      </Link>
      <h1 style={styles.pageTitle}>Add Client</h1>
      <div style={styles.pageSub}>
        Create a new client record and start tracking pipeline, payments and ownership.
      </div>

      <div style={styles.formShell}>
        {error ? <div style={styles.errorText}>{error}</div> : <div style={styles.okText} />}

        <form onSubmit={onSubmit}>
          {/* Company Information */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Company Information</div>

            <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>
                  Company Name <span style={{ color: '#EF4444' }}>*</span>
                </div>
                <input
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>Website</div>
                <input
                  className="input"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>Country</div>
                <select
                  className="input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="">Select country (optional)</option>
                  {COUNTRIES.map((countryName) => (
                    <option key={countryName} value={countryName}>
                      {countryName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={styles.label}>City</div>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>Timezone</div>
                <select
                  className="input"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <option value="">Select timezone (optional)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Chicago">America/Chicago</option>
                  <option value="America/Denver">America/Denver</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="America/Toronto">America/Toronto</option>
                  <option value="America/Vancouver">America/Vancouver</option>
                  <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Paris">Europe/Paris</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="Europe/Amsterdam">Europe/Amsterdam</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="Asia/Karachi">Asia/Karachi</option>
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Australia/Sydney">Australia/Sydney</option>
                  <option value="Pacific/Auckland">Pacific/Auckland</option>
                </select>
                <div style={styles.help}>
                  Keep it short. Don’t stretch the field across the whole page.
                </div>
              </div>

              <div>
                <div style={styles.label}>Initial Total Paid (USD)</div>
                {/* ✅ spinner removed: use text input + numeric keyboard */}
                <input
                  className="input"
                  inputMode="decimal"
                  pattern="^[0-9]*[.]?[0-9]*$"
                  value={totalPaidUsd}
                  onChange={(e) => setTotalPaidUsd(e.target.value)}
                  placeholder="0"
                />
                <div style={styles.help}>Optional. You can leave it as 0.</div>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Profile & Segments */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Profile & Segments</div>

            <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>Industry</div>
                <select
                  className="input"
                  value={segmentIndustry}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setSegmentIndustry(slug);
                    setIndustry(segmentLookup[slug]?.name || '');
                  }}
                >
                  <option value="">Select Industry</option>
                  {(segmentsByType.industry || []).map((segment) => (
                    <option key={segment.id} value={segment.slug}>
                      {segment.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={styles.label}>Business Type</div>
                <select
                  className="input"
                  value={segmentBusinessType}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setSegmentBusinessType(slug);
                    setBusinessType(segmentLookup[slug]?.name || '');
                  }}
                >
                  <option value="">Select Business Type</option>
                  {(segmentsByType.business_type || []).map((segment) => (
                    <option key={segment.id} value={segment.slug}>
                      {segment.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={styles.label}>Geo Segment</div>
                <select
                  className="input"
                  value={segmentGeo}
                  onChange={(e) => setSegmentGeo(e.target.value)}
                >
                  <option value="">Select Geo</option>
                  {(segmentsByType.geo || []).map((segment) => (
                    <option key={segment.id} value={segment.slug}>
                      {segment.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="grid grid-cols-2 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>Employee Count</div>
                <select
                  className="input"
                  value={employeeCountRange}
                  onChange={(e) => setEmployeeCountRange(e.target.value)}
                >
                  <option value="">Select Range</option>
                  {employeeRanges.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={styles.label}>Years in Business</div>
                <select
                  className="input"
                  value={yearsInBusinessRange}
                  onChange={(e) => setYearsInBusinessRange(e.target.value)}
                >
                  <option value="">Select Range</option>
                  {yearsRanges.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div>
              <div style={styles.label}>Services</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(segmentsByType.service || []).map((segment) => {
                  const checked = segmentServices.includes(segment.slug);
                  return (
                    <label
                      key={segment.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: checked ? 'rgba(59,130,246,0.08)' : 'transparent',
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSegmentServices((prev) =>
                            prev.includes(segment.slug)
                              ? prev.filter((slug) => slug !== segment.slug)
                              : [...prev, segment.slug],
                          );
                        }}
                      />
                      {segment.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Primary Contact */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Primary Contact</div>

            <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>
                  Contact Name <span style={{ color: '#EF4444' }}>*</span>
                </div>
                <input
                  className="input"
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>Contact Title</div>
                <input
                  className="input"
                  value={primaryContactTitle}
                  onChange={(e) => setPrimaryContactTitle(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>
                  Contact Email <span style={{ color: '#EF4444' }}>*</span>
                </div>
                <input
                  className="input"
                  value={primaryContactEmail}
                  onChange={(e) => setPrimaryContactEmail(e.target.value)}
                />
              </div>

              <div>
                <div style={styles.label}>Contact Phone</div>
                <input
                  className="input"
                  value={primaryContactPhone}
                  onChange={(e) => setPrimaryContactPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Ownership */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Ownership</div>

            <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>
                  Sales Owner <span style={{ color: '#EF4444' }}>*</span>
                </div>
                <select
                  className="input"
                  value={salesOwner}
                  onChange={(e) => setSalesOwner(e.target.value)}
                  required
                >
                  <option value="">Select sales owner</option>
                  {salesUsers.map((user) => (
                    <option key={user.uid} value={user.name}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={styles.label}>Account Manager</div>
                <select
                  className="input"
                  value={accountManager}
                  onChange={(e) => setAccountManager(e.target.value)}
                >
                  <option value="">Select account manager</option>
                  {amUsers.map((user) => (
                    <option key={user.uid} value={user.name}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={styles.label}>Production Owner</div>
                <select
                  className="input"
                  value={productionOwner}
                  onChange={(e) => setProductionOwner(e.target.value)}
                >
                  <option value="">Select production owner</option>
                  {productionUsers.map((user) => (
                    <option key={user.uid} value={user.name}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Pipeline */}
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>Pipeline</div>

            <div className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
              <div>
                <div style={styles.label}>Sales Stage</div>
                <select
                  className="input"
                  value={salesStage}
                  onChange={(e) => setSalesStage(e.target.value as SalesStage)}
                >
                  <option value="New Lead">New Lead</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Qualified">Qualified</option>
                  <option value="Proposal Sent">Proposal Sent</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Closed Won">Closed Won</option>
                  <option value="Closed Lost">Closed Lost</option>
                </select>
              </div>

              <div>
                <div style={styles.label}>Payment Status</div>
                <select
                  className="input"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                >
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Paid">Paid</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>

              <div>
                <div style={styles.label}>Retainer Status</div>
                <select
                  className="input"
                  value={retainerStatus}
                  onChange={(e) => setRetainerStatus(e.target.value as RetainerStatus)}
                >
                  <option value="None">None</option>
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          <div style={styles.actions}>
            <LoadingButton
              className="btn"
              type="submit"
              loading={loading}
              loadingText="Creating..."
            >
              Add Client
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
