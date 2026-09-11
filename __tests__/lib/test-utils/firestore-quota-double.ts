/**
 * A minimal Firestore double for the storage quota suites.
 *
 * The shared __tests__/api/test-utils/firestore-emulator models neither aggregate queries
 * nor subcollections, and the quota layer needs both: usage is four `AggregateField.sum`
 * queries, and reservations live in `tenant_storage_ledgers/{tenantId}/reservations`.
 * Widening that fixture would change a file many certified suites depend on, so this one
 * is separate and deliberately small — just enough to run the real modules.
 */

export type Row = Record<string, any>;

/** `AggregateField.sum('x')` marker, matching the shape storage-limit.ts builds. */
type SumSpec = { __sum: string };

export class FakeDb {
  /** collection path -> docId -> data */
  readonly cols = new Map<string, Map<string, Row>>();
  private seq = 0;

  collection(path: string) {
    return new FakeCollection(this, path);
  }

  batch() {
    return new FakeBatch();
  }

  runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const tx = new FakeTx();
    return fn(tx).then((result) => {
      tx.flush();
      return result;
    });
  }

  nextId() {
    this.seq += 1;
    return `auto_${this.seq}`;
  }

  bucket(path: string) {
    if (!this.cols.has(path)) this.cols.set(path, new Map());
    return this.cols.get(path)!;
  }

  seed(path: string, rows: Array<[string, Row]>) {
    rows.forEach(([id, data]) => this.bucket(path).set(id, data));
  }
}

export class FakeDocRef {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
    readonly id: string,
  ) {}

  get() {
    const data = this.db.bucket(this.path).get(this.id);
    return Promise.resolve({
      exists: data !== undefined,
      id: this.id,
      ref: this,
      data: () => data,
    });
  }

  set(data: Row, options?: { merge?: boolean }) {
    const existing = options?.merge ? this.db.bucket(this.path).get(this.id) || {} : {};
    this.db.bucket(this.path).set(this.id, { ...existing, ...data });
    return Promise.resolve();
  }

  update(data: Row) {
    const existing = this.db.bucket(this.path).get(this.id) || {};
    this.db.bucket(this.path).set(this.id, { ...existing, ...data });
    return Promise.resolve();
  }

  delete() {
    this.db.bucket(this.path).delete(this.id);
    return Promise.resolve();
  }

  collection(name: string) {
    return new FakeCollection(this.db, `${this.path}/${this.id}/${name}`);
  }
}

export class FakeQuery {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
    readonly filters: Array<[string, string, unknown]> = [],
  ) {}

  where(field: string, op: string, value: unknown) {
    return new FakeQuery(this.db, this.path, [...this.filters, [field, op, value]]);
  }

  aggregate(spec: Record<string, SumSpec>) {
    return new FakeAggregate(this, spec);
  }

  /** Ordering and paging do not change which rows these suites assert on. */
  orderBy() {
    return this;
  }

  limit() {
    return this;
  }

  rows() {
    return Array.from(this.db.bucket(this.path).entries())
      .filter(([, data]) =>
        this.filters.every(([field, , value]) => {
          const actual = data[field];
          // `deletedAt == null` must match both an absent field and an explicit null.
          if (value === null) return actual === null || actual === undefined;
          return actual === value;
        }),
      )
      .map(([id, data]) => ({ id, data: () => data, ref: new FakeDocRef(this.db, this.path, id) }));
  }

  get() {
    const docs = this.rows();
    return Promise.resolve({ docs, size: docs.length, empty: docs.length === 0 });
  }
}

export class FakeCollection extends FakeQuery {
  doc(id?: string) {
    return new FakeDocRef(this.db, this.path, id ?? this.db.nextId());
  }

  async add(data: Row) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export class FakeAggregate {
  constructor(
    readonly query: FakeQuery,
    readonly spec: Record<string, SumSpec>,
  ) {}

  get() {
    const rows = this.query.rows();
    const out: Row = {};
    Object.entries(this.spec).forEach(([key, sum]) => {
      out[key] = rows.reduce((running, row) => running + Number(row.data()[sum.__sum] || 0), 0);
    });
    return Promise.resolve({ data: () => out });
  }
}

/** Mirrors Firestore's batch: writes queue and apply on commit(). */
export class FakeBatch {
  private readonly writes: Array<() => void> = [];

  set(ref: FakeDocRef, data: Row, options?: { merge?: boolean }) {
    this.writes.push(() => void ref.set(data, options));
    return this;
  }

  update(ref: FakeDocRef, data: Row) {
    this.writes.push(() => void ref.update(data));
    return this;
  }

  delete(ref: FakeDocRef) {
    this.writes.push(() => void ref.delete());
    return this;
  }

  async commit() {
    this.writes.forEach((write) => write());
  }
}

export class FakeTx {
  private readonly writes: Array<() => void> = [];

  get(target: { get: () => Promise<any> }) {
    return target.get();
  }

  set(ref: FakeDocRef, data: Row, options?: { merge?: boolean }) {
    this.writes.push(() => void ref.set(data, options));
    return this;
  }

  delete(ref: FakeDocRef) {
    this.writes.push(() => void ref.delete());
    return this;
  }

  flush() {
    this.writes.forEach((write) => write());
  }
}
