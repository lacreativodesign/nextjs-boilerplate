/**
 * NOT-04 — The notification sink no longer swallows failures.
 *
 * `createNotifications` (app/lib/notifications.ts) used to wrap its whole body in a
 * try/catch that only console.error'd and returned void, so any Firestore failure lost
 * the notification with no record and no signal to the caller — fatal for approval,
 * revenue and invite events.
 *
 * It now returns a NotificationDeliveryOutcome and, on failure, writes a
 * `dead_letter_notifications` record (guarded so a logging failure can't mask the
 * original error) before reporting `failed: true`. These assertions pin that contract:
 * the outcome return, the dead-letter write, the guard around it, and that the early
 * no-op branches also return an outcome rather than bare void.
 */

jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date('2026-01-01T00:00:00.000Z'),
    },
  },
}));

const mockUsersGet = jest.fn();
const mockDeadLetterAdd = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  get adminDb() {
    return {
      collection: (name: string) => {
        if (name === 'dead_letter_notifications') {
          return { add: mockDeadLetterAdd };
        }
        if (name === 'users') {
          return { doc: () => ({ get: mockUsersGet }) };
        }
        return { doc: () => ({ id: 'n_generated', set: jest.fn() }) };
      },
      batch: () => ({ set: jest.fn(), commit: jest.fn(async () => {}) }),
    };
  },
}));

jest.mock('@/lib/notifications/preferences', () => ({
  NotificationPreferenceService: {
    shouldSendNow: jest.fn(async () => ({ deliverNow: true, reason: 'ok' })),
    queueDigestItem: jest.fn(async () => {}),
  },
}));

import { createNotifications } from '@/app/lib/notifications';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockUsersGet.mockReset().mockResolvedValue({ exists: false, data: () => ({}) });
  mockDeadLetterAdd.mockReset().mockResolvedValue({ id: 'dl_1' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NOT-04: createNotifications surfaces failures instead of swallowing them', () => {
  it('returns a NotificationDeliveryOutcome object, not void', async () => {
    const outcome = await createNotifications({ recipients: [], title: 'Hi', message: 'body' });

    expect(outcome).toBeDefined();
    expect(outcome).toEqual({ ok: true, written: 0, failed: false });
    expect(Object.keys(outcome).sort()).toEqual(['failed', 'ok', 'written']);
  });

  it('writes a dead_letter_notifications record and reports failure when the sink throws', async () => {
    mockUsersGet.mockRejectedValue(new Error('firestore unavailable'));

    const outcome = await createNotifications({
      recipients: [{ uid: 'u1' }],
      title: 'Payout',
      message: 'You were paid',
      type: 'deal_paid',
      tenantId: 'tenant_a',
    });

    expect(outcome).toEqual({ ok: false, written: 0, failed: true });
    expect(mockDeadLetterAdd).toHaveBeenCalledTimes(1);
    const record = mockDeadLetterAdd.mock.calls[0][0];
    expect(record.recipientCount).toBe(1);
    expect(record.type).toBe('deal_paid');
    expect(record.title).toBe('Payout');
    expect(record.error).toContain('firestore unavailable');
  });

  it('does not throw or mask the original error if the dead-letter write itself fails', async () => {
    mockUsersGet.mockRejectedValue(new Error('firestore unavailable'));
    mockDeadLetterAdd.mockRejectedValue(new Error('dead-letter down'));

    const outcome = await createNotifications({
      recipients: [{ uid: 'u1' }],
      title: 'Payout',
      message: 'You were paid',
    });

    // The guarded dead-letter write was attempted, but its failure is swallowed
    // internally so the caller still gets a clean failure outcome (never a throw).
    expect(mockDeadLetterAdd).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, written: 0, failed: true });
  });

  it('returns an outcome for the early no-op branches rather than bare void', async () => {
    const noRecipients = await createNotifications({ recipients: [], title: 'Hi', message: 'x' });
    const noUids = await createNotifications({
      recipients: [{ uid: '' }],
      title: 'Hi',
      message: 'x',
    });
    const noContent = await createNotifications({
      recipients: [{ uid: 'u1' }],
      title: '',
      message: '',
    });

    for (const outcome of [noRecipients, noUids, noContent]) {
      expect(outcome).toBeDefined();
      expect(outcome).toEqual({ ok: true, written: 0, failed: false });
    }
    // None of these early exits should have touched the dead-letter collection.
    expect(mockDeadLetterAdd).not.toHaveBeenCalled();
  });
});
