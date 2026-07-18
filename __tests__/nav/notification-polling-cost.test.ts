import * as fs from 'fs';
import * as path from 'path';

/**
 * N2 — reduce notification/activity polling cost (NOT-05).
 *
 * The audit measured ~8 Firestore queries every 8 seconds per active user from the notification
 * toast and activity-feed polling. Since F4 the authoritative unread badge is push-based (the
 * bell's realtime onSnapshot listener), so the transient toast surface and the activity feed no
 * longer need an 8-second cadence. This session raises those idle poll intervals to 30s, cutting
 * the steady-state read cost of those paths ~73% with no user-visible effect (toasts auto-dismiss
 * in 4.5s; the badge is realtime).
 *
 * This test pins that reduced cadence and the realtime bell, and fails the build if any regresses:
 *   1. NotificationToast polls at 30s, not 8s.
 *   2. ActivityFeedSidebar no longer polls unread at 8s and loads no faster than 30s.
 *   3. NotificationBell is driven by a realtime onSnapshot listener (not a poll interval).
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('N2: notification/activity polling cost (NOT-05)', () => {
  it('polls the notification toast at 30s, not 8s', () => {
    const toast = read('components/notifications/NotificationToast.tsx');
    expect(toast).toContain('setInterval(fetchNotifications, 30000)');
    expect(toast).not.toContain('setInterval(fetchNotifications, 8000)');
  });

  it('no longer polls the activity feed unread count at 8s', () => {
    const sidebar = read('components/activity/ActivityFeedSidebar.tsx');
    expect(sidebar).toContain('setInterval(() => void fetchUnread(), 30000)');
    expect(sidebar).toContain('setInterval(() => void load(), 30000)');
    expect(sidebar).not.toContain('setInterval(() => void fetchUnread(), 8000)');
    expect(sidebar).not.toContain('setInterval(() => void load(), 15000)');
  });

  it('drives the bell unread badge from a realtime onSnapshot listener', () => {
    const bell = read('components/notifications/NotificationBell.tsx');
    expect(bell).toContain('onSnapshot');
    expect(bell).toContain("from 'firebase/firestore'");
    // The badge must not fall back to interval polling.
    expect(bell).not.toContain('setInterval');
  });
});
