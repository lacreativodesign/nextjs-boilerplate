export type FirestoreRecord = Record<string, any>;

type DocSeed = { id: string; data: FirestoreRecord };
type Seed = Record<string, DocSeed[]>;

type WhereFilter = { field: string; op: '=='; value: unknown };
type OrderRule = { field: string; direction: 'asc' | 'desc' };

class MockDocSnapshot {
  constructor(
    public readonly id: string,
    private readonly record: FirestoreRecord | undefined,
  ) {}

  get exists() {
    return this.record !== undefined;
  }

  data() {
    if (!this.record) return undefined;
    return structuredClone(this.record);
  }
}

class MockDocRef {
  constructor(
    private readonly db: FirestoreEmulator,
    private readonly collectionName: string,
    public readonly id: string,
  ) {}

  /**
   * Subcollection access. Real routes read e.g. projects/{id}/messages; without
   * this the emulator threw a synchronous TypeError that route-level `.catch()`
   * could not trap. Subcollections are stored under a flattened path key so they
   * behave like any other collection (seed them as 'projects/proj_a/messages').
   */
  collection(name: string) {
    return new MockCollectionRef(this.db, `${this.collectionName}/${this.id}/${name}`);
  }

  async get() {
    return new MockDocSnapshot(this.id, this.db.getDoc(this.collectionName, this.id));
  }

  async set(data: FirestoreRecord, options?: { merge?: boolean }) {
    const existing = this.db.getDoc(this.collectionName, this.id);
    if (options?.merge && existing) {
      this.db.setDoc(this.collectionName, this.id, { ...existing, ...structuredClone(data) });
      return;
    }
    this.db.setDoc(this.collectionName, this.id, structuredClone(data));
  }

  async update(data: FirestoreRecord) {
    const existing = this.db.getDoc(this.collectionName, this.id);
    if (!existing) {
      throw new Error(`Missing doc ${this.collectionName}/${this.id}`);
    }
    this.db.setDoc(this.collectionName, this.id, { ...existing, ...structuredClone(data) });
  }

  async delete() {
    this.db.deleteDoc(this.collectionName, this.id);
  }
}

class MockQuery {
  constructor(
    protected readonly db: FirestoreEmulator,
    protected readonly collectionName: string,
    private readonly filters: WhereFilter[] = [],
    private readonly order: OrderRule | null = null,
    private readonly max: number | null = null,
  ) {}

  where(field: string, op: '==', value: unknown) {
    return new MockQuery(
      this.db,
      this.collectionName,
      [...this.filters, { field, op, value }],
      this.order,
      this.max,
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new MockQuery(
      this.db,
      this.collectionName,
      this.filters,
      { field, direction },
      this.max,
    );
  }

  limit(max: number) {
    return new MockQuery(this.db, this.collectionName, this.filters, this.order, max);
  }

  async get() {
    const rows = this.db
      .getCollectionDocs(this.collectionName)
      .filter(({ data }) => this.filters.every((f) => data[f.field] === f.value));

    if (this.order) {
      rows.sort((a, b) => {
        const av = a.data[this.order!.field];
        const bv = b.data[this.order!.field];
        if (av === bv) return 0;
        const result = av > bv ? 1 : -1;
        return this.order!.direction === 'desc' ? -result : result;
      });
    }

    const limitedRows = this.max === null ? rows : rows.slice(0, this.max);
    return {
      docs: limitedRows.map(({ id, data }) => ({
        id,
        data: () => structuredClone(data),
        ref: new MockDocRef(this.db, this.collectionName, id),
      })),
      empty: limitedRows.length === 0,
    };
  }
}

class MockCollectionRef extends MockQuery {
  constructor(db: FirestoreEmulator, collectionName: string) {
    super(db, collectionName);
  }

  doc(id?: string) {
    const finalId = id ?? this.db.nextId();
    return new MockDocRef(this.db, this.collectionName, finalId);
  }

  async add(data: FirestoreRecord) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class MockBatch {
  private readonly updates: Array<{ ref: MockDocRef; data: FirestoreRecord }> = [];

  update(ref: MockDocRef, data: FirestoreRecord) {
    this.updates.push({ ref, data });
  }

  async commit() {
    await Promise.all(this.updates.map((u) => u.ref.update(u.data)));
  }
}

class MockTransaction {
  private readonly writes: Array<() => Promise<void>> = [];

  async get(target: MockDocRef | MockQuery) {
    return target.get();
  }

  set(ref: MockDocRef, data: FirestoreRecord, options?: { merge?: boolean }) {
    this.writes.push(() => ref.set(data, options));
    return this;
  }

  update(ref: MockDocRef, data: FirestoreRecord) {
    this.writes.push(() => ref.update(data));
    return this;
  }

  delete(ref: MockDocRef) {
    this.writes.push(() => ref.delete());
    return this;
  }

  async commit() {
    for (const write of this.writes) {
      await write();
    }
  }
}

export class FirestoreEmulator {
  private readonly db = new Map<string, Map<string, FirestoreRecord>>();
  private seq = 0;

  constructor(seed: Seed = {}) {
    Object.entries(seed).forEach(([collection, docs]) => {
      docs.forEach(({ id, data }) => this.setDoc(collection, id, structuredClone(data)));
    });
  }

  collection(name: string) {
    return new MockCollectionRef(this, name);
  }

  batch() {
    return new MockBatch();
  }

  // Mirrors Firestore's runTransaction shape closely enough for API tests:
  // reads happen live, writes queue and apply after the callback resolves.
  async runTransaction<T>(fn: (tx: MockTransaction) => Promise<T>): Promise<T> {
    const tx = new MockTransaction();
    const result = await fn(tx);
    await tx.commit();
    return result;
  }

  nextId() {
    this.seq += 1;
    return `doc_${this.seq}`;
  }

  getDoc(collectionName: string, id: string) {
    return this.db.get(collectionName)?.get(id);
  }

  setDoc(collectionName: string, id: string, data: FirestoreRecord) {
    if (!this.db.has(collectionName)) {
      this.db.set(collectionName, new Map());
    }
    this.db.get(collectionName)!.set(id, data);
  }

  deleteDoc(collectionName: string, id: string) {
    this.db.get(collectionName)?.delete(id);
  }

  getCollectionDocs(collectionName: string) {
    const collection = this.db.get(collectionName);
    if (!collection) return [] as Array<{ id: string; data: FirestoreRecord }>;
    return Array.from(collection.entries()).map(([id, data]) => ({ id, data }));
  }
}

export function buildTenantSeed() {
  return {
    invoices: [
      {
        id: 'inv_tenant_a',
        data: {
          tenantId: 'tenant_a',
          isDeleted: false,
          status: 'draft',
          orderId: 'ORD-A',
          clientId: 'client_a',
          amountTotal: 150,
        },
      },
      {
        id: 'inv_tenant_b',
        data: {
          tenantId: 'tenant_b',
          isDeleted: false,
          status: 'draft',
          orderId: 'ORD-B',
          clientId: 'client_b',
          amountTotal: 220,
        },
      },
    ],
    tax_rates: [
      {
        id: 'tax_a_default',
        data: {
          tenantId: 'tenant_a',
          name: 'VAT',
          rate: 10,
          country: 'US',
          isActive: true,
          isDefault: true,
        },
      },
      {
        id: 'tax_b',
        data: {
          tenantId: 'tenant_b',
          name: 'GST',
          rate: 12,
          country: 'CA',
          isActive: true,
          isDefault: true,
        },
      },
    ],
    budgets: [
      {
        id: 'budget_a',
        data: {
          tenantId: 'tenant_a',
          name: 'Ops Budget',
          status: 'active',
          type: 'department',
          ownerId: 'owner_a',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          totalAmount: 1000,
          actualAmount: 600,
          categories: [
            { id: 'cat_1', allocatedAmount: 1000, spentAmount: 600, remainingAmount: 400 },
          ],
        },
      },
      {
        id: 'budget_b',
        data: {
          tenantId: 'tenant_b',
          name: 'Other Budget',
          status: 'active',
          type: 'department',
          ownerId: 'owner_b',
        },
      },
    ],
    recurring_invoice_templates: [
      {
        id: 'template_a',
        data: {
          tenantId: 'tenant_a',
          clientId: 'client_a',
          status: 'active',
          name: 'Monthly Retainer',
          frequency: 'monthly',
          interval: 1,
          createdAt: new Date('2025-01-01'),
        },
      },
      {
        id: 'template_b',
        data: {
          tenantId: 'tenant_b',
          clientId: 'client_b',
          status: 'active',
          name: 'Tenant B',
          frequency: 'monthly',
          interval: 1,
        },
      },
    ],
    clients: [
      { id: 'client_a', data: { tenantId: 'tenant_a', companyName: 'Tenant A Client' } },
      { id: 'client_b', data: { tenantId: 'tenant_b', companyName: 'Tenant B Client' } },
    ],
    users: [
      { id: 'owner_a', data: { tenantId: 'tenant_a', name: 'Owner A', role: 'finance' } },
      { id: 'owner_b', data: { tenantId: 'tenant_b', name: 'Owner B', role: 'finance' } },
    ],
    sessions: [
      { id: 'sess_current', data: { uid: 'user_a', expiresAt: Date.now() + 60000 } },
      { id: 'sess_other', data: { uid: 'user_a', expiresAt: Date.now() + 60000 } },
      { id: 'sess_foreign', data: { uid: 'user_b', expiresAt: Date.now() + 60000 } },
    ],
  } satisfies Seed;
}
