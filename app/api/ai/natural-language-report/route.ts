import { type NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getTenantAIKey } from '@/lib/ai/agent-task';
import { getCurrentUserOrThrow } from '@/lib/tenant/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

const ALLOWED_ROLES = new Set([
  'admin',
  'super_admin',
  'finance',
  'hr',
  'sales_manager',
  'am_manager',
  'production_manager',
]);

// ─── Report output type ───────────────────────────────────────────────────────

export type ReportResult = {
  type: 'bar' | 'line' | 'pie' | 'table' | 'kpi';
  title: string;
  summary: string;
  xLabel?: string;
  yLabel?: string;
  data: Record<string, unknown>[];
  columns?: string[];
};

type FirestoreTimestampLike = {
  toDate: () => Date;
};

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input?: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type OpenAIToolCall = {
  id: string;
  function: {
    name: string;
    arguments?: string;
  };
};

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
};

// ─── Firestore query tools ────────────────────────────────────────────────────

function toISO(val: unknown): string | null {
  if (!val) return null;
  try {
    if (
      typeof val === 'object' &&
      val !== null &&
      'toDate' in val &&
      typeof (val as FirestoreTimestampLike).toDate === 'function'
    ) {
      return (val as FirestoreTimestampLike).toDate().toISOString();
    }
    return new Date(val as string | number | Date).toISOString();
  } catch {
    return null;
  }
}

async function queryRevenueByMonth(tenantId: string, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const snap = await adminDb
    .collection('invoices')
    .where('tenantId', '==', tenantId)
    .where('isPaid', '==', true)
    .limit(200)
    .get();

  const byMonth: Record<string, number> = {};
  snap.docs.forEach((doc) => {
    const d = doc.data();
    const paid = toISO(d.paidAt || d.updatedAt);
    if (!paid) return;
    const dt = new Date(paid);
    if (dt < since) return;
    const key = dt.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    byMonth[key] = (byMonth[key] || 0) + Number(d.amountTotalUsd || 0);
  });

  const labels = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    labels.push(d.toLocaleString('en-US', { month: 'short', year: '2-digit' }));
  }

  return labels.map((label) => ({
    label,
    value: Math.round((byMonth[label] || 0) * 100) / 100,
  }));
}

async function queryRevenueByClient(tenantId: string, limit = 8) {
  const snap = await adminDb
    .collection('invoices')
    .where('tenantId', '==', tenantId)
    .where('isPaid', '==', true)
    .limit(200)
    .get();

  const byClient: Record<string, number> = {};
  snap.docs.forEach((doc) => {
    const d = doc.data();
    const name = d.clientName || 'Unknown';
    byClient[name] = (byClient[name] || 0) + Number(d.amountTotalUsd || 0);
  });

  return Object.entries(byClient)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
}

async function queryLeadsByStage(tenantId: string) {
  const snap = await adminDb.collection('leads').where('tenantId', '==', tenantId).limit(200).get();

  const stages = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
  const counts: Record<string, number> = {};
  stages.forEach((s) => {
    counts[s] = 0;
  });
  snap.docs.forEach((doc) => {
    const s = doc.data().stage || 'New';
    if (counts[s] !== undefined) counts[s]++;
    else counts[s] = 1;
  });

  return stages.map((label) => ({ label, value: counts[label] || 0 }));
}

async function queryLeadsBySource(tenantId: string) {
  const snap = await adminDb.collection('leads').where('tenantId', '==', tenantId).limit(200).get();

  const bySource: Record<string, number> = {};
  snap.docs.forEach((doc) => {
    const s = doc.data().source || 'Unknown';
    bySource[s] = (bySource[s] || 0) + 1;
  });

  return Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

async function queryProjectsByStatus(tenantId: string) {
  const snap = await adminDb
    .collection('projects')
    .where('tenantId', '==', tenantId)
    .limit(200)
    .get();

  const statuses: Record<string, number> = {};
  snap.docs.forEach((doc) => {
    const s = doc.data().stage || 'Unknown';
    statuses[s] = (statuses[s] || 0) + 1;
  });

  return Object.entries(statuses)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

async function queryInvoiceAging(tenantId: string) {
  const snap = await adminDb
    .collection('invoices')
    .where('tenantId', '==', tenantId)
    .where('isPaid', '==', false)
    .limit(200)
    .get();

  const buckets = {
    Current: 0,
    '1–30 days': 0,
    '31–60 days': 0,
    '61–90 days': 0,
    '90+ days': 0,
  };
  const now = Date.now();

  snap.docs.forEach((doc) => {
    const d = doc.data();
    const due = toISO(d.dueDate);
    if (!due) return;
    const days = Math.floor((now - new Date(due).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) buckets['Current'] += Number(d.amountTotalUsd || 0);
    else if (days <= 30) buckets['1–30 days'] += Number(d.amountTotalUsd || 0);
    else if (days <= 60) buckets['31–60 days'] += Number(d.amountTotalUsd || 0);
    else if (days <= 90) buckets['61–90 days'] += Number(d.amountTotalUsd || 0);
    else buckets['90+ days'] += Number(d.amountTotalUsd || 0);
  });

  return Object.entries(buckets).map(([label, value]) => ({
    label,
    value: Math.round(value * 100) / 100,
  }));
}

async function queryTeamByRole(tenantId: string) {
  const snap = await adminDb.collection('users').where('tenantId', '==', tenantId).limit(200).get();

  const byRole: Record<string, number> = {};
  snap.docs.forEach((doc) => {
    const r = doc.data().role || 'unknown';
    byRole[r] = (byRole[r] || 0) + 1;
  });

  return Object.entries(byRole)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

async function queryOutstandingInvoices(tenantId: string, limit = 10) {
  const snap = await adminDb
    .collection('invoices')
    .where('tenantId', '==', tenantId)
    .where('isPaid', '==', false)
    .orderBy('dueDate', 'asc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    const due = toISO(d.dueDate);
    const dueDate = due
      ? new Date(due).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';
    const daysOverdue = due
      ? Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    return {
      Client: d.clientName || 'Unknown',
      Invoice: d.orderId || doc.id.slice(0, 8),
      Amount: `$${Number(d.amountTotalUsd || 0).toLocaleString()}`,
      'Due Date': dueDate,
      'Days Overdue': daysOverdue > 0 ? daysOverdue : 'Current',
    };
  });
}

// ─── Tool definitions for LLM ─────────────────────────────────────────────────

const REPORT_TOOLS = [
  {
    name: 'query_revenue_by_month',
    description: 'Revenue collected per month (paid invoices). Use for revenue trends over time.',
    parameters: {
      type: 'object',
      properties: {
        months: { type: 'number', description: 'Number of months to show. Default 6.' },
      },
      required: [],
    },
  },
  {
    name: 'query_revenue_by_client',
    description: 'Total revenue by client name (paid invoices). Use for client revenue breakdown.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max clients to return. Default 8.' } },
      required: [],
    },
  },
  {
    name: 'query_leads_by_stage',
    description: 'Count of leads in each sales pipeline stage.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_leads_by_source',
    description: 'Count of leads by source (Website, Referral, etc).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_projects_by_status',
    description: 'Count of projects by current status/stage.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_invoice_aging',
    description: 'Outstanding invoice amounts grouped by how overdue they are.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_team_by_role',
    description: 'Team headcount broken down by role.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_outstanding_invoices',
    description: 'List of unpaid invoices with client, amount, due date, and days overdue.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max rows. Default 10.' } },
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `You are the Bizosto Reports Agent. Answer questions about the business by calling data tools and producing a single JSON chart or table.

After calling tools, respond ONLY with a valid JSON object in this exact format — no text before or after:

For bar, line, or pie charts:
{"type":"bar"|"line"|"pie","title":"...","summary":"One sentence finding","xLabel":"...","yLabel":"...","data":[{"label":"...","value":number}]}

For tables:
{"type":"table","title":"...","summary":"...","columns":["Col1","Col2"],"data":[{"Col1":"...","Col2":"..."}]}

For a single KPI number:
{"type":"kpi","title":"...","summary":"...","data":[{"label":"...","value":number}]}

Rules:
- Only use data from tool results. Never invent numbers.
- Choose the most appropriate chart type for the question.
- Use "bar" for comparisons, "line" for trends over time, "pie" for proportions, "table" for detailed lists.
- Keep title under 60 characters.
- Respond with ONLY the JSON object. No explanation, no markdown, no code fences.`;

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  tenantId: string,
): Promise<unknown> {
  switch (name) {
    case 'query_revenue_by_month':
      return queryRevenueByMonth(tenantId, Number(input.months || 6));
    case 'query_revenue_by_client':
      return queryRevenueByClient(tenantId, Number(input.limit || 8));
    case 'query_leads_by_stage':
      return queryLeadsByStage(tenantId);
    case 'query_leads_by_source':
      return queryLeadsBySource(tenantId);
    case 'query_projects_by_status':
      return queryProjectsByStatus(tenantId);
    case 'query_invoice_aging':
      return queryInvoiceAging(tenantId);
    case 'query_team_by_role':
      return queryTeamByRole(tenantId);
    case 'query_outstanding_invoices':
      return queryOutstandingInvoices(tenantId, Number(input.limit || 10));
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow(req as unknown as Parameters<typeof getCurrentUserOrThrow>[0]).catch(() => null);
    if (!user || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { question?: unknown };
    const question = String(body.question || '').trim();
    if (!question || question.length < 5) {
      return NextResponse.json({ ok: false, error: 'question is required' }, { status: 400 });
    }

    const keyConfig = await getTenantAIKey(user.tenantId || '');
    if (!keyConfig) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No AI API key configured. Go to Settings → AI Workforce to add your OpenAI or Anthropic key.',
        },
        { status: 422 },
      );
    }

    let rawJson: string;

    if (keyConfig.provider === 'anthropic') {
      rawJson = await runAnthropicReportLoop(keyConfig.apiKey, question, user.tenantId || '');
    } else {
      rawJson = await runOpenAIReportLoop(keyConfig.apiKey, question, user.tenantId || '');
    }

    const clean = rawJson
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const report = JSON.parse(clean) as ReportResult;

    return NextResponse.json({ ok: true, report });
  } catch (err: unknown) {
    console.error('[NL_REPORT]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to generate report' },
      { status: 500 },
    );
  }
}

async function runAnthropicReportLoop(
  apiKey: string,
  question: string,
  tenantId: string,
): Promise<string> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }> =
    [{ role: 'user', content: question }];
  const anthropicTools = REPORT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: anthropicTools,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as {
      content: AnthropicContentBlock[];
      stop_reason?: 'end_turn' | 'tool_use' | string;
    };
    messages.push({ role: 'assistant', content: data.content });

    if (data.stop_reason === 'end_turn') {
      const text = data.content.find((b): b is { type: 'text'; text: string } => b.type === 'text');
      if (text?.text) return text.text;
      throw new Error('No JSON response');
    }

    if (data.stop_reason === 'tool_use') {
      const toolResults: AnthropicContentBlock[] = [];
      for (const block of data.content.filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input?: Record<string, unknown> } =>
          b.type === 'tool_use',
      )) {
        const output = await executeTool(block.name, block.input || {}, tenantId);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }
  }
  throw new Error('Report agent exceeded iterations');
}

async function runOpenAIReportLoop(
  apiKey: string,
  question: string,
  tenantId: string,
): Promise<string> {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];
  const openaiTools = REPORT_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1024,
        tools: openaiTools,
        tool_choice: 'auto',
        messages,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{
        message: OpenAIMessage;
        finish_reason?: 'stop' | 'tool_calls' | string;
      }>;
    };
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No OpenAI response');
    messages.push(choice.message);

    if (choice.finish_reason === 'stop') return choice.message.content || '';

    if (choice.finish_reason === 'tool_calls') {
      for (const tc of choice.message.tool_calls || []) {
        const output = await executeTool(
          tc.function.name,
          JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
          tenantId,
        );
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(output) });
      }
    }
  }
  throw new Error('Report agent exceeded iterations');
}
