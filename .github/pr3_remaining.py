from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}")
    p.write_text(text.replace(old, new, 1))


# Invoice creation must never manufacture successful-money state.
replace(
    "app/api/finance/invoices/create/route.ts",
    """    const clientName = parseString(client.companyName || client.name).trim();
    const totalPaid = parseNumber(body?.totalPaid, 0);
    if (totalPaid < 0 || totalPaid > totalInCurrency) {
      throw new AppError({
        message: 'Total paid must be between 0 and the invoice total.',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }
    const status = computeInvoiceStatus({
      currentStatus: statusInput,
      totalPaid,
      totalAmount: totalInCurrency,
    });
    const balanceDue = computeBalanceDue(totalInCurrency, totalPaid);
""",
    """    const clientName = parseString(client.companyName || client.name).trim();
    const requestedTotalPaid = parseNumber(body?.totalPaid, 0);
    if (requestedTotalPaid !== 0 || statusInput === 'paid' || statusInput === 'partially_paid') {
      throw new AppError({
        message:
          'Invoice creation cannot record successful payment. Create the invoice unpaid, then reconcile payment through Finance.',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }
    const totalPaid = 0;
    const status = computeInvoiceStatus({
      currentStatus: statusInput,
      totalPaid,
      totalAmount: totalInCurrency,
    });
    const balanceDue = computeBalanceDue(totalInCurrency, totalPaid);
""",
)

# Manual payment confirmation may not be used to turn Stripe-owned pending rows into success.
replace(
    "lib/finance/manualClientPayment.ts",
    """    if (normalizePaymentStatus(payment.status) === 'refunded') {
      throw new Error('Refunded payments cannot be marked successful again.');
    }

    amount = money(Number(payment.amountUsd || 0));
""",
    """    if (normalizePaymentStatus(payment.status) === 'refunded') {
      throw new Error('Refunded payments cannot be marked successful again.');
    }
    const existingSource = String(payment.source || '').toLowerCase();
    const existingMethod = String(payment.method || '').toLowerCase();
    if (existingSource.includes('stripe') || existingMethod.includes('stripe')) {
      throw new Error('Stripe-originated payments must be reconciled from signed Stripe evidence.');
    }

    amount = money(Number(payment.amountUsd || 0));
""",
)

# Explicit tenant at admin project activation callsite.
replace(
    "app/api/admin/projects/create/route.ts",
    """      activationResult = await ensureClientAccountActivation({
        clientId,
        clientData,
        createdByUid: me.uid,
      });
""",
    """      activationResult = await ensureClientAccountActivation({
        clientId,
        clientData,
        tenantId: me.tenantId,
        createdByUid: me.uid,
      });
""",
)

# Currency-precision-correct 50/50 default: split minor units, not whole major units.
replace(
    "lib/finance/paymentSchedule.ts",
    "import { roundCurrencyAmount } from '@/lib/finance/minorUnits';\n",
    "import { amountToMinorUnits, minorUnitsToAmount, roundCurrencyAmount } from '@/lib/finance/minorUnits';\n",
)
replace(
    "lib/finance/paymentSchedule.ts",
    """  const firstInstallmentAmount =
    paymentPlan === 'fifty_fifty'
      ? roundCurrencyAmount(
          configuredFirst > 0
            ? Math.min(configuredFirst, amountTotal)
            : Math.ceil(amountTotal / 2),
          currency,
        )
      : amountTotal;
""",
    """  const defaultFirstInstallment = minorUnitsToAmount(
    Math.ceil(amountToMinorUnits(amountTotal, currency) / 2),
    currency,
  );
  const firstInstallmentAmount =
    paymentPlan === 'fifty_fifty'
      ? roundCurrencyAmount(
          configuredFirst > 0
            ? Math.min(configuredFirst, amountTotal)
            : defaultFirstInstallment,
          currency,
        )
      : amountTotal;
""",
)

# Emulator-aware Firebase Admin initialization.
replace(
    "lib/firebaseAdmin.ts",
    """try {
  if (!admin.apps.length && hasProject) {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (admin.apps.length) {
""",
    """try {
  if (!admin.apps.length && process.env.FIRESTORE_EMULATOR_HOST) {
    app = admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || 'demo-bizosto',
    });
  } else if (!admin.apps.length && hasProject) {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (admin.apps.length) {
""",
)

# The integration suite must not poison normal Jest runs; it runs explicitly in emulator CI.
replace(
    "__tests__/integration/client-payment-engine.emulator.test.ts",
    """beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('This suite must run against the Firestore emulator.');
  }
});

beforeEach(async () => {
""",
    """const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

beforeEach(async () => {
""",
)
replace(
    "__tests__/integration/client-payment-engine.emulator.test.ts",
    "describe('canonical client payment engine — Firestore emulator', () => {\n",
    "describeWithEmulator('canonical client payment engine — Firestore emulator', () => {\n",
)
replace(
    "__tests__/integration/client-payment-engine.emulator.test.ts",
    """    const projects = await adminDb
      .collection('projects')
      .where('tenantId', '==', TENANT)
      .where('dealId', '==', 'deal-50')
      .get();
    expect(projects.size).toBe(1);
""",
    """    const projects = await adminDb.collection('projects').where('tenantId', '==', TENANT).get();
    const matchingProjects = projects.docs.filter(
      (doc) => String(doc.data()?.dealId || '') === 'deal-50',
    );
    expect(matchingProjects).toHaveLength(1);
""",
)

# Run the behavioral suite against a real Firestore emulator in every PR quality gate.
replace(
    ".github/workflows/test.yml",
    """      - name: Run tests under a non-UTC timezone (QUAL-02 regression guard)
        run: TZ=Asia/Karachi npm test
        env:
          TZ: Asia/Karachi

      - name: Build application
""",
    """      - name: Run tests under a non-UTC timezone (QUAL-02 regression guard)
        run: TZ=Asia/Karachi npm test
        env:
          TZ: Asia/Karachi

      - name: Payment engine Firestore emulator invariants
        run: >-
          npx --yes firebase-tools@13.35.1 emulators:exec --only firestore --project demo-bizosto
          \"npx jest __tests__/integration/client-payment-engine.emulator.test.ts --runInBand --coverage=false\"
        env:
          GCLOUD_PROJECT: demo-bizosto

      - name: Build application
""",
)
