import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getReportSettings, requireReportsAccess, toISO, toMillis } from '../_utils';
import { getValueBand, slugify, valueBands } from '@/lib/segments';
import { normalizeInvoiceStatus } from '@/lib/finance/status';
import { normalizeTenantId } from '@/lib/tenant';
import { queryWithTenant } from '@/lib/tenant/query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

export async function GET(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const settings = await getReportSettings();
    const { searchParams } = new URL(req.url);
    const segmentType = String(searchParams.get('segmentType') || '').trim();
    const segmentValue = String(searchParams.get('segmentValue') || '').trim();
    const dateFrom = parseDate(searchParams.get('dateFrom'));
    const dateTo = parseDate(searchParams.get('dateTo'), true);

    const [clientDocs, projectDocs, invoiceDocs, changeRequestDocs, changeRequestAltDocs] =
      await Promise.all([
        queryWithTenant(
          adminDb.collection('clients').where('isDeleted', '==', false).limit(500),
          tenantId,
        ),
        queryWithTenant(
          adminDb.collection('projects').where('isDeleted', '==', false).limit(500),
          tenantId,
        ),
        queryWithTenant(
          adminDb.collection('invoices').where('isDeleted', '==', false).limit(500),
          tenantId,
        ),
        queryWithTenant(
          adminDb.collection('changeRequests').where('isDeleted', '==', false).limit(500),
          tenantId,
        ),
        queryWithTenant(
          adminDb.collection('change_requests').where('isDeleted', '==', false).limit(500),
          tenantId,
        ),
      ]);

    type DocRecord = { id: string } & Record<string, any>;
    const clients = clientDocs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocRecord[];
    const projects = projectDocs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocRecord[];
    const invoices = invoiceDocs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocRecord[];
    const changeRequests: DocRecord[] = [
      ...changeRequestDocs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...changeRequestAltDocs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ];

    const filteredClients = clients.filter((client) => {
      if (!segmentType || !segmentValue) return true;
      const value = slugify(segmentValue);
      if (segmentType === 'service') {
        const services = Array.isArray(client.segmentServices) ? client.segmentServices : [];
        return services.map((item: string) => slugify(item)).includes(value);
      }
      if (segmentType === 'business_type') {
        return slugify(client.segmentBusinessType || '') === value;
      }
      if (segmentType === 'industry') {
        return slugify(client.segmentIndustry || '') === value;
      }
      if (segmentType === 'geo') {
        return slugify(client.segmentGeo || client.country || '') === value;
      }
      if (segmentType === 'value') {
        const band = getValueBand(Number(client.totalPaidUsd || 0));
        return band.slug === value;
      }
      return true;
    });

    const invoiceTotalsByClient = invoices.reduce((acc, inv) => {
      if (normalizeInvoiceStatus(inv.status) !== 'paid') return acc;
      const paidMs = toMillis(inv.paidAt || inv.updatedAt || inv.createdAt);
      if (dateFrom && (!paidMs || paidMs < dateFrom.getTime())) return acc;
      if (dateTo && (!paidMs || paidMs > dateTo.getTime())) return acc;
      const clientId = String(inv.clientId || '');
      acc.set(clientId, (acc.get(clientId) || 0) + Number(inv.amountTotalUsd || 0));
      return acc;
    }, new Map<string, number>());

    const activeProjectsByClient = projects.reduce((acc, project) => {
      const stage = String(project.stage || '').toLowerCase();
      if (stage === 'delivered') return acc;
      const clientId = String(project.clientId || '');
      acc.set(clientId, (acc.get(clientId) || 0) + 1);
      return acc;
    }, new Map<string, number>());

    const lastActivityByClient = projects.reduce((acc, project) => {
      const clientId = String(project.clientId || '');
      const updatedMs = toMillis(project.updatedAt || project.createdAt);
      if (!updatedMs) return acc;
      const existing = acc.get(clientId) || 0;
      acc.set(clientId, Math.max(existing, updatedMs));
      return acc;
    }, new Map<string, number>());

    const keyAccounts = filteredClients
      .filter((client) => Number(client.totalPaidUsd || 0) >= settings.keyAccountUsdThreshold)
      .map((client) => ({
        id: client.id,
        name: client.companyName || client.name || 'Client',
        totalPaidUsd: Number(client.totalPaidUsd || 0),
      }))
      .sort((a, b) => b.totalPaidUsd - a.totalPaidUsd);

    const clientHealthDistribution = projects.reduce((acc, project) => {
      const health = String(project.health || 'On Track');
      acc.set(health, (acc.get(health) || 0) + 1);
      return acc;
    }, new Map<string, number>());

    const changeRequestsByClient = changeRequests.reduce((acc, request) => {
      const clientId = String(request.clientId || '');
      const clientName = String(request.clientName || 'Unknown');
      const entry = acc.get(clientId) || { clientId, clientName, count: 0 };
      entry.count += 1;
      acc.set(clientId, entry);
      return acc;
    }, new Map<string, { clientId: string; clientName: string; count: number }>());

    const segmentCoverage = [
      {
        label: 'Service Segments',
        value: filteredClients.filter(
          (client) => Array.isArray(client.segmentServices) && client.segmentServices.length,
        ).length,
      },
      {
        label: 'Business Types',
        value: filteredClients.filter((client) => client.segmentBusinessType).length,
      },
      {
        label: 'Industries',
        value: filteredClients.filter((client) => client.segmentIndustry).length,
      },
      {
        label: 'Geographies',
        value: filteredClients.filter((client) => client.segmentGeo || client.country).length,
      },
      {
        label: 'Value Bands',
        value: filteredClients.filter((client) => Number(client.totalPaidUsd || 0) > 0).length,
      },
    ];

    const clientRows = filteredClients
      .map((client) => {
        const clientId = client.id;
        const revenue = invoiceTotalsByClient.get(clientId) || Number(client.totalPaidUsd || 0);
        const lastActivityMs = lastActivityByClient.get(clientId) || null;
        const lastActivity = lastActivityMs ? new Date(lastActivityMs).toISOString() : null;
        return {
          id: clientId,
          name: client.companyName || client.name || 'Client',
          totalPaidUsd: revenue,
          activeProjects: activeProjectsByClient.get(clientId) || 0,
          lastActivity,
        };
      })
      .filter((row) => {
        if (!dateFrom && !dateTo) return true;
        const lastMs = row.lastActivity ? new Date(row.lastActivity).getTime() : null;
        if (dateFrom && (!lastMs || lastMs < dateFrom.getTime())) return false;
        if (dateTo && (!lastMs || lastMs > dateTo.getTime())) return false;
        return true;
      })
      .sort((a, b) => b.totalPaidUsd - a.totalPaidUsd)
      .slice(0, 100);

    const segmentOptions = {
      service: Array.from(
        new Set(
          filteredClients
            .flatMap((client) =>
              Array.isArray(client.segmentServices) ? client.segmentServices : [],
            )
            .map((value) => String(value)),
        ),
      ),
      business_type: Array.from(
        new Set(filteredClients.map((client) => client.segmentBusinessType).filter(Boolean)),
      ),
      industry: Array.from(
        new Set(filteredClients.map((client) => client.segmentIndustry).filter(Boolean)),
      ),
      geo: Array.from(
        new Set(
          filteredClients.map((client) => client.segmentGeo || client.country).filter(Boolean),
        ),
      ),
      value: valueBands.map((band) => band.name),
    };

    return NextResponse.json({
      ok: true,
      keyAccounts,
      clientHealthDistribution: Array.from(clientHealthDistribution.entries()).map(
        ([label, value]) => ({
          label,
          value,
        }),
      ),
      changeRequestsByClient: Array.from(changeRequestsByClient.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      segmentCoverage,
      clients: clientRows,
      segmentOptions,
    });
  } catch (err: any) {
    console.error('reports/clients error:', err);
    const rawMessage = String(err?.message || '');
    const isIndexError =
      rawMessage.includes('FAILED_PRECONDITION') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.toLowerCase().includes('indexes');
    const safeMessage = isIndexError
      ? 'Missing Firestore index.'
      : 'Unable to load client reports.';
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
