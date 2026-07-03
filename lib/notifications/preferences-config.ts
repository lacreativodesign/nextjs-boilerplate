import type { UserNotificationEventType } from '@/types/notifications';

export const USER_NOTIFICATION_EVENT_TYPES: UserNotificationEventType[] = [
  'invoice_sent',
  'invoice_paid',
  'invoice_overdue',
  'task_assigned',
  'task_due_soon',
  'task_completed',
  'project_status_changed',
  'project_milestone_reached',
  'approval_pending',
  'approval_approved',
  'approval_rejected',
  'leave_request_submitted',
  'leave_request_approved',
  'system_maintenance',
  'system_updates',
];

export const USER_NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'push'] as const;
