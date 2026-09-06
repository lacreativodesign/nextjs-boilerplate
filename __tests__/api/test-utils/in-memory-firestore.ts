/**
 * An in-memory Firestore double for behavioural tests.
 *
 * PR5's durability invariants — an outbox row leased by exactly one worker, an idempotency
 * key that cannot send twice, a digest group that cannot starve the queue — are properties
 * of how the code behaves at runtime, not of how it reads. Source-string assertions cannot
 * observe any of them: they pass just as happily against code that persists nothing.
 *
 * Transactions here are SERIALIZED rather than optimistic. Firestore gives serializable
 * isolation, so running each transaction to completion before the next one starts models
 * the outcome a real conflict-and-retry produces, and it does so deterministically. A test
 * for "two workers cannot both claim the same row" is then a genuine test: the second
 * transaction really does observe the first one's lease.
 *
 * The emulator remains the authority for contention — see the emulator suites the Quality
 * Gates workflow runs. This double is for the logic those suites are too coarse to reach.
 */

type DocData = Record<string, unknown>;

type WhereClause = [string, string, unknown];

/** Deep clone so a caller mutating a returned object cannot corrupt stored state. */
function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as unknown as T;
  const out: DocData = {};
  for (const [key, entry] of Object.entries(value as DocData)) out[key] = clone(entry);
  return out as unknown as T;
}

/** Firestore compares Timestamps by instant; tests may also use ISO strings or numbers. */
function comparable(value: unknown): number | string {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return String(value ?? '');
}

function matches(data: DocData, [field, op, operand]: WhereClause): boolean {
  const actual = data[field];
  switch (op) {
    case '==':
      return comparable(actual) === comparable(operand);
    case '!=':
      return comparable(actual) !== comparable(operand);
    case 'in':
      return (
        Array.isArray(operand) && operand.some((entry) => comparable(actual) === comparable(entry))
      );
    case '<=':
      return comparable(actual) <= comparable(operand);
    case '<':
      return comparable(actual) < comparable(operand);
    case '>=':
      return comparable(actual) >= comparable(operand);
    case '>':
      return comparable(actual) > comparable(operand);
    default:
      throw new Error(`in-memory firestore: unsupported operator ${op}`);
  }
}

export type InMemoryFirestore = ReturnType<typeof createInMemoryFirestore>;

export function createInMemoryFirestore() {
  /** collection name -> document id -> data */
  const store = new Map<string, Map<string, DocData>>();

  /** Faults injected by a test: key is `${collection}/${id}` or `${collection}/*`. */
  const failures = new Map<
    string,
    { op: 'get' | 'set' | 'update' | 'commit' | 'add'; error: Error }[]
  >();

  let autoId = 0;
  let transactionQueue: Promise<unknown> = Promise.resolve();

  function collectionMap(name: string): Map<string, DocData> {
    let existing = store.get(name);
    if (!existing) {
      existing = new Map();
      store.set(name, existing);
    }
    return existing;
  }

  function checkFault(collection: string, id: string, op: string) {
    for (const key of [`${collection}/${id}`, `${collection}/*`]) {
      const queue = failures.get(key);
      if (!queue?.length) continue;
      // Match on operation rather than only the head of the queue: a fault queued for a
      // different operation must not silently swallow the one the test actually wants.
      const index = queue.findIndex((entry) => entry.op === op);
      if (index === -1) continue;
      const [fault] = queue.splice(index, 1);
      throw fault.error;
    }
  }

  function docRef(collection: string, id: string) {
    return {
      id,
      __collection: collection,
      async get() {
        checkFault(collection, id, 'get');
        return snapshotOf(collection, id);
      },
      async set(data: DocData, options?: { merge?: boolean }) {
        checkFault(collection, id, 'set');
        applySet(collection, id, data, options);
      },
      async update(data: DocData) {
        checkFault(collection, id, 'update');
        applyUpdate(collection, id, data);
      },
      async delete() {
        collectionMap(collection).delete(id);
      },
    };
  }

  type Ref = ReturnType<typeof docRef>;

  function snapshotOf(collection: string, id: string) {
    const data = collectionMap(collection).get(id);
    return {
      id,
      exists: data !== undefined,
      ref: docRef(collection, id),
      data: () => (data === undefined ? undefined : clone(data)),
    };
  }

  function applySet(collection: string, id: string, data: DocData, options?: { merge?: boolean }) {
    const map = collectionMap(collection);
    const next = options?.merge ? { ...(map.get(id) || {}), ...clone(data) } : clone(data);
    map.set(id, next);
  }

  function applyUpdate(collection: string, id: string, data: DocData) {
    const map = collectionMap(collection);
    const existing = map.get(id);
    if (existing === undefined) throw new Error(`No document to update: ${collection}/${id}`);
    map.set(id, { ...existing, ...clone(data) });
  }

  function query(
    collection: string,
    wheres: WhereClause[],
    order: [string, string] | null,
    max: number | null,
  ) {
    return {
      where(field: string, op: string, operand: unknown) {
        return query(collection, [...wheres, [field, op, operand]], order, max);
      },
      orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
        return query(collection, wheres, [field, direction], max);
      },
      limit(count: number) {
        return query(collection, wheres, order, count);
      },
      async get() {
        let entries = [...collectionMap(collection).entries()].filter(([, data]) =>
          wheres.every((clause) => matches(data, clause)),
        );

        if (order) {
          const [field, direction] = order;
          entries.sort(([, a], [, b]) => {
            const left = comparable(a[field]);
            const right = comparable(b[field]);
            if (left === right) return 0;
            const ascending = left < right ? -1 : 1;
            return direction === 'desc' ? -ascending : ascending;
          });
        }

        if (max !== null) entries = entries.slice(0, max);

        const docs = entries.map(([id]) => snapshotOf(collection, id));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }

  function collection(name: string) {
    return {
      doc(id?: string) {
        autoId += 1;
        return docRef(name, id ?? `auto_${autoId}`);
      },
      async add(data: DocData) {
        autoId += 1;
        const id = `auto_${autoId}`;
        checkFault(name, '*', 'add');
        applySet(name, id, data);
        return docRef(name, id);
      },
      where(field: string, op: string, operand: unknown) {
        return query(name, [[field, op, operand]], null, null);
      },
      orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
        return query(name, [], [field, direction], null);
      },
      limit(count: number) {
        return query(name, [], null, count);
      },
      async get() {
        return query(name, [], null, null).get();
      },
    };
  }

  const adminDb = {
    collection,

    batch() {
      const writes: Array<() => void> = [];
      let faultCollection: string | null = null;
      return {
        set(ref: Ref, data: DocData, options?: { merge?: boolean }) {
          faultCollection = ref.__collection;
          writes.push(() => applySet(ref.__collection, ref.id, data, options));
        },
        update(ref: Ref, data: DocData) {
          faultCollection = ref.__collection;
          writes.push(() => applyUpdate(ref.__collection, ref.id, data));
        },
        delete(ref: Ref) {
          faultCollection = ref.__collection;
          writes.push(() => collectionMap(ref.__collection).delete(ref.id));
        },
        async commit() {
          if (faultCollection) checkFault(faultCollection, '*', 'commit');
          // Firestore applies a batch atomically; nothing here can fail part-way.
          for (const write of writes) write();
        },
      };
    },

    /**
     * Serialized to model Firestore's serializable isolation. Two callers racing for the
     * same row therefore observe each other, which is the point of the concurrency tests.
     */
    async runTransaction<T>(handler: (tx: TransactionLike) => Promise<T>): Promise<T> {
      const run = transactionQueue.then(async () => {
        const staged: Array<() => void> = [];
        const tx: TransactionLike = {
          async get(ref: Ref) {
            checkFault(ref.__collection, ref.id, 'get');
            return snapshotOf(ref.__collection, ref.id);
          },
          set(ref: Ref, data: DocData, options?: { merge?: boolean }) {
            checkFault(ref.__collection, ref.id, 'set');
            staged.push(() => applySet(ref.__collection, ref.id, data, options));
          },
          update(ref: Ref, data: DocData) {
            checkFault(ref.__collection, ref.id, 'update');
            staged.push(() => applyUpdate(ref.__collection, ref.id, data));
          },
          delete(ref: Ref) {
            staged.push(() => collectionMap(ref.__collection).delete(ref.id));
          },
        };

        const value = await handler(tx);
        for (const write of staged) write();
        return value;
      });

      // Keep the chain alive after a rejection so one failing transaction does not wedge
      // every later one in the same test.
      transactionQueue = run.catch(() => undefined);
      return run;
    },
  };

  return {
    adminDb,

    /** Reads the raw stored document, bypassing the query surface. */
    read(collectionName: string, id: string): DocData | undefined {
      const data = collectionMap(collectionName).get(id);
      return data === undefined ? undefined : clone(data);
    },

    /** Every document in a collection, as `[id, data]`. */
    all(collectionName: string): Array<[string, DocData]> {
      return [...collectionMap(collectionName).entries()].map(([id, data]) => [id, clone(data)]);
    },

    seed(collectionName: string, id: string, data: DocData) {
      applySet(collectionName, id, data);
    },

    /** Makes the next matching operation throw once. `id` may be `*` for any document. */
    failNext(
      collectionName: string,
      id: string,
      op: 'get' | 'set' | 'update' | 'commit' | 'add',
      message = 'injected firestore fault',
    ) {
      const key = `${collectionName}/${id}`;
      const queue = failures.get(key) || [];
      queue.push({ op, error: new Error(message) });
      failures.set(key, queue);
    },

    reset() {
      store.clear();
      failures.clear();
      autoId = 0;
      transactionQueue = Promise.resolve();
    },
  };
}

type TransactionLike = {
  get(ref: { id: string; __collection: string }): Promise<{
    id: string;
    exists: boolean;
    data: () => DocData | undefined;
  }>;
  set(
    ref: { id: string; __collection: string },
    data: DocData,
    options?: { merge?: boolean },
  ): void;
  update(ref: { id: string; __collection: string }, data: DocData): void;
  delete(ref: { id: string; __collection: string }): void;
};
