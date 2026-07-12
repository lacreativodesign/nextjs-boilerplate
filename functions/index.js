const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

admin.initializeApp();

exports.pollEmailInboxes = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  const mailboxesSnap = await admin
    .firestore()
    .collection('userMailboxes')
    .where('enabled', '==', true)
    .get();

  for (const mailboxDoc of mailboxesSnap.docs) {
    const mailbox = mailboxDoc.data() || {};
    const tenantId = mailbox.tenantId || '';
    const emailAccountId = mailbox.emailAccountId || '';
    if (!emailAccountId) continue;

    const accountSnap = await admin
      .firestore()
      .collection('emailAccounts')
      .doc(emailAccountId)
      .get();
    if (!accountSnap.exists) continue;
    const account = accountSnap.data() || {};
    if (!account.enabled) continue;

    const client = new ImapFlow({
      host: account.imapHost,
      port: Number(account.imapPort || 993),
      secure: Boolean(account.imapSecure),
      auth: {
        user: account.username,
        pass: account.passwordEncrypted,
      },
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const lastUid = Number(mailbox.lastUid || 0);
        const range = lastUid ? `${lastUid + 1}:*` : '1:*';
        for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true })) {
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.map((v) => v.address) || [];
          const to = parsed.to?.value?.map((v) => v.address) || [];
          const cc = parsed.cc?.value?.map((v) => v.address) || [];
          const subject = parsed.subject || '(no subject)';
          const bodyText = parsed.text || '';
          const bodyHtml = parsed.html || null;
          let leadId = null;
          if (from.length) {
            const leadSnap = await admin
              .firestore()
              .collection('leads')
              .where('tenantId', '==', tenantId)
              .where('contactEmail', '==', from[0])
              .limit(1)
              .get();
            if (!leadSnap.empty) {
              leadId = leadSnap.docs[0].id;
            }
          }
          const threadKey = `${subject
            .toLowerCase()
            .replace(/^re:\s*/i, '')
            .trim()}::${[...from, ...to]
            .map((a) => a.toLowerCase())
            .sort()
            .join('|')}`;

          const emailRef = admin.firestore().collection('emails').doc();
          await emailRef.set({
            id: emailRef.id,
            tenantId,
            mailboxUserId: mailbox.userId || '',
            emailAccountId,
            direction: 'inbound',
            messageId: parsed.messageId || null,
            threadKey,
            subject,
            from,
            to,
            cc,
            bodyText,
            bodyHtml,
            leadId,
            clientId: null,
            status: 'received',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false,
          });

          if (mailbox.userId) {
            const notificationRef = admin.firestore().collection('notifications').doc();
            await notificationRef.set({
              id: notificationRef.id,
              toUserId: mailbox.userId,
              title: 'New email received',
              body: `New email from ${from[0] || 'unknown'}: ${subject}`,
              type: 'info',
              entityType: 'email',
              entityId: emailRef.id,
              deepLink: '/sales/inbox',
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          if (msg.uid && msg.uid > lastUid) {
            mailboxDoc.ref.set({ lastUid: msg.uid }, { merge: true });
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error('IMAP poll error:', err);
    } finally {
      await client.logout().catch(() => null);
    }
  }
});

exports.purgeAuditLogs = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoff);
  const collection = admin.firestore().collection('audit_logs');

  let hasMore = true;
  while (hasMore) {
    const snapshot = await collection
      .where('timestamp', '<', cutoffTimestamp)
      .orderBy('timestamp', 'asc')
      .limit(500)
      .get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = admin.firestore().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    hasMore = snapshot.size === 500;
  }
});

function getTimePartsInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    weekday: weekdayMap[lookup.weekday],
  };
}

function shouldRunSchedule(report, now) {
  const schedule = report.schedule || {};
  if (!schedule.enabled) return false;
  const timeZone = schedule.timezone || 'UTC';
  const parts = getTimePartsInZone(now, timeZone);
  const [hour, minute] = String(schedule.time || '00:00')
    .split(':')
    .map((val) => Number(val));

  if (parts.hour !== hour || parts.minute !== minute) return false;

  if (schedule.frequency === 'weekly' && parts.weekday !== Number(schedule.dayOfWeek)) {
    return false;
  }
  if (schedule.frequency === 'monthly' && parts.day !== Number(schedule.dayOfMonth)) {
    return false;
  }

  const lastScheduledAt = report.lastScheduledAt?.toDate ? report.lastScheduledAt.toDate() : null;
  if (lastScheduledAt) {
    const lastParts = getTimePartsInZone(lastScheduledAt, timeZone);
    const lastKey = `${lastParts.year}-${lastParts.month}-${lastParts.day}-${lastParts.hour}-${lastParts.minute}`;
    const currentKey = `${parts.year}-${parts.month}-${parts.day}-${parts.hour}-${parts.minute}`;
    if (lastKey === currentKey) return false;
  }

  return true;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeFilterValue(value) {
  if (typeof value === 'string') {
    if (value === 'CURRENT_YEAR_START') {
      return admin.firestore.Timestamp.fromDate(new Date(new Date().getFullYear(), 0, 1));
    }
    if (value === 'CURRENT_MONTH_START') {
      return admin.firestore.Timestamp.fromDate(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      );
    }
    if (value === 'LAST_90_DAYS') {
      return admin.firestore.Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    }
    if (value === 'LAST_180_DAYS') {
      return admin.firestore.Timestamp.fromDate(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    }
    if (value.includes(',')) {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return value;
}

function applyFilter(query, filter) {
  const value = normalizeFilterValue(filter.value);
  switch (filter.operator) {
    case 'equals':
      return query.where(filter.field, '==', value);
    case 'notEquals':
      return query.where(filter.field, '!=', value);
    case 'greaterThan':
      return query.where(filter.field, '>', value);
    case 'greaterThanOrEqual':
      return query.where(filter.field, '>=', value);
    case 'lessThan':
      return query.where(filter.field, '<', value);
    case 'lessThanOrEqual':
      return query.where(filter.field, '<=', value);
    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        return query.where(filter.field, '>=', value[0]).where(filter.field, '<=', value[1]);
      }
      return query;
    case 'in':
      return Array.isArray(value) ? query.where(filter.field, 'in', value) : query;
    case 'notIn':
      return Array.isArray(value) ? query.where(filter.field, 'not-in', value) : query;
    case 'contains':
      return query.where(filter.field, 'array-contains', value);
    case 'isNull':
      return query.where(filter.field, '==', null);
    case 'isNotNull':
      return query.where(filter.field, '!=', null);
    default:
      return query;
  }
}

function applyDerivedFields(row, groupBy) {
  const createdAt = toDate(row.createdAt);
  if (createdAt) {
    row.month = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
    row.day = createdAt.toISOString().slice(0, 10);
  }
  if (groupBy && groupBy.includes('ageGroup')) {
    const referenceDate = toDate(row.dueDate || row.createdAt || row.updatedAt);
    if (referenceDate) {
      const ageInDays = Math.max(
        0,
        Math.floor((Date.now() - referenceDate.getTime()) / (24 * 60 * 60 * 1000)),
      );
      if (ageInDays <= 30) row.ageGroup = '0-30';
      else if (ageInDays <= 60) row.ageGroup = '31-60';
      else if (ageInDays <= 90) row.ageGroup = '61-90';
      else row.ageGroup = '90+';
    }
  }
  return row;
}

function calculateAggregation(rows, agg) {
  const values = rows.map((row) => row[agg.field]).filter((value) => value != null);
  switch (agg.function) {
    case 'sum':
      return values.reduce((sum, val) => sum + Number(val || 0), 0);
    case 'avg':
      return values.length
        ? values.reduce((sum, val) => sum + Number(val || 0), 0) / values.length
        : 0;
    case 'count':
      return values.length;
    case 'min':
      return values.length ? Math.min(...values.map((val) => Number(val))) : 0;
    case 'max':
      return values.length ? Math.max(...values.map((val) => Number(val))) : 0;
    default:
      return 0;
  }
}

function applyAggregations(data, groupBy, aggregations) {
  if (!aggregations || aggregations.length === 0) return data;
  if (!groupBy || groupBy.length === 0) {
    const result = {};
    aggregations.forEach((agg) => {
      const alias = agg.alias || agg.field;
      result[alias] = calculateAggregation(data, agg);
    });
    return [result];
  }

  const groups = data.reduce((acc, row) => {
    const key = groupBy.map((field) => row[field]).join('|');
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return Object.entries(groups).map(([key, rows]) => {
    const result = {};
    const keyParts = String(key).split('|');
    groupBy.forEach((field, index) => {
      result[field] = keyParts[index];
    });
    aggregations.forEach((agg) => {
      const alias = agg.alias || agg.field;
      result[alias] = calculateAggregation(rows, agg);
    });
    return result;
  });
}

async function runCustomReport(report, filters, dateRange) {
  if (report.id !== 'profit-loss') {
    throw new Error('Custom report handler not found');
  }

  const [invoices, expenses] = await Promise.all([
    runCollectionQuery('invoices', report, filters, dateRange),
    runCollectionQuery('expenses', report, filters, dateRange),
  ]);

  const revenue = invoices.reduce((sum, row) => sum + Number(row.total || row.amount || 0), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.total || row.amount || 0), 0);

  return [
    { label: 'Revenue', value: revenue },
    { label: 'Expenses', value: expenseTotal },
    { label: 'Net Profit', value: revenue - expenseTotal },
  ];
}

async function runCollectionQuery(collection, report, filters, dateRange) {
  let query = admin.firestore().collection(collection);
  const allFilters = [...(report.filters || []), ...(filters || [])];
  allFilters.forEach((filter) => {
    query = applyFilter(query, filter);
  });
  if (dateRange) {
    query = query
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date(dateRange.start)))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(new Date(dateRange.end)));
  }
  query = query.orderBy('createdAt', 'desc');
  const snapshot = await query.limit(1000).get();
  let data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  data = data.map((row) => applyDerivedFields(row, report.groupBy));
  if (report.aggregations?.length) {
    data = applyAggregations(data, report.groupBy, report.aggregations);
  }
  return data;
}

async function executeScheduledReport(report) {
  if (report.dataSource === 'custom') {
    return runCustomReport(report, [], null);
  }
  const collection = report.dataSource === 'opportunities' ? 'deals' : report.dataSource;
  return runCollectionQuery(collection, report, [], null);
}

function toCsv(data) {
  if (!data || !data.length) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        const formatted = value instanceof Date ? value.toISOString() : value;
        return typeof formatted === 'string' && formatted.includes(',')
          ? `\"${formatted}\"`
          : formatted;
      })
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

exports.sendScheduledReports = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  const now = new Date();
  const reportsSnap = await admin
    .firestore()
    .collection('reports')
    .where('isScheduled', '==', true)
    .get();

  for (const doc of reportsSnap.docs) {
    const report = { id: doc.id, ...doc.data() };
    if (!report.schedule || !report.schedule.enabled) continue;
    if (!shouldRunSchedule(report, now)) continue;

    try {
      const data = await executeScheduledReport(report);
      const csv = toCsv(data);
      const bucket = admin.storage().bucket();
      const filePath = `reports/${report.tenantId}/${report.id}/${Date.now()}.csv`;
      const file = bucket.file(filePath);
      await file.save(csv, { contentType: 'text/csv' });
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000,
      });

      const recipients = Array.isArray(report.recipients) ? report.recipients : [];
      const emailBody = `
        <p>Your scheduled report <strong>${report.name}</strong> is ready.</p>
        <p><a href=\"${signedUrl}\">Download CSV</a></p>
      `;

      for (const recipient of recipients) {
        const emailRef = admin.firestore().collection('emails').doc();
        await emailRef.set({
          tenantId: report.tenantId || null,
          to: recipient,
          subject: `Scheduled report: ${report.name}`,
          html: emailBody,
          status: 'queued',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await admin
        .firestore()
        .collection('report_executions')
        .add({
          tenantId: report.tenantId,
          reportId: report.id,
          executedBy: 'system',
          executedAt: admin.firestore.Timestamp.now(),
          duration: 0,
          status: 'success',
          rowCount: Array.isArray(data) ? data.length : 0,
          resultSize: csv.length,
          resultUrl: signedUrl,
          filters: report.filters || [],
        });

      await doc.ref.update({
        lastScheduledAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      console.error('Scheduled report failed:', err);
      await admin
        .firestore()
        .collection('report_executions')
        .add({
          tenantId: report.tenantId,
          reportId: report.id,
          executedBy: 'system',
          executedAt: admin.firestore.Timestamp.now(),
          duration: 0,
          status: 'failed',
          rowCount: 0,
          resultSize: 0,
          errorMessage: err?.message || 'Scheduled report error',
          filters: report.filters || [],
        });
    }
  }
});
