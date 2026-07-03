import type { ErrorCode } from '@/lib/errors';

export type UserErrorMessage = {
  title: string;
  message: string;
  action: string;
};

const EN_MESSAGES: Record<ErrorCode, UserErrorMessage> = {
  UNAUTHORIZED: {
    title: 'Session required',
    message: 'Your session has expired or you are not signed in.',
    action: 'Sign in again and retry your request.',
  },
  FORBIDDEN: {
    title: 'Access restricted',
    message: 'You do not have permission to perform this action.',
    action: 'Contact your administrator if you need access.',
  },
  NOT_FOUND: {
    title: 'Item not found',
    message: 'The requested record could not be found.',
    action: 'Refresh your data and confirm the item still exists.',
  },
  CONFLICT: {
    title: 'Change conflict',
    message: 'This data changed before your request completed.',
    action: 'Refresh and retry with the latest data.',
  },
  VALIDATION_ERROR: {
    title: 'Check your input',
    message: 'Some information is invalid or incomplete.',
    action: 'Review the highlighted fields and try again.',
  },
  RATE_LIMITED: {
    title: 'Too many requests',
    message: 'You have reached the request limit for a short period.',
    action: 'Wait a moment and retry.',
  },
  SUBSCRIPTION_LOCKED: {
    title: 'Plan upgrade required',
    message: 'Your current subscription does not include this capability.',
    action: 'Upgrade your plan to continue.',
  },
  SUBSCRIPTION_READ_ONLY: {
    title: 'Read-only mode',
    message: 'Your plan currently allows viewing but not editing.',
    action: 'Upgrade your plan or contact billing support.',
  },
  TENANT_SUSPENDED: {
    title: 'Workspace suspended',
    message: 'This workspace is currently suspended.',
    action: 'Contact billing support to restore access.',
  },
  INTERNAL_SERVER_ERROR: {
    title: 'Something went wrong',
    message: 'We could not complete your request due to a server issue.',
    action: 'Retry now. If the issue continues, report it.',
  },
};

const FALLBACK: UserErrorMessage = EN_MESSAGES.INTERNAL_SERVER_ERROR;

function normalizeMessage(message?: string | null) {
  if (!message) return null;
  const technicalPatterns = [/firebase/i, /stack/i, /exception/i, /trace/i, /\bat\s+\w+/i];
  if (technicalPatterns.some((pattern) => pattern.test(message))) {
    return null;
  }
  return message;
}

export function getUserErrorMessage(params: {
  code?: ErrorCode | null;
  message?: string | null;
  locale?: 'en';
}): UserErrorMessage {
  const locale = params.locale || 'en';
  if (locale !== 'en') {
    return FALLBACK;
  }

  const selected = (params.code && EN_MESSAGES[params.code]) || FALLBACK;
  const normalizedMessage = normalizeMessage(params.message);

  return {
    ...selected,
    message: normalizedMessage || selected.message,
  };
}
