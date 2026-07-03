import toast from 'react-hot-toast';
import { AppError, isAppError, resolveErrorResponse } from '@/lib/errors';
import { logError, serializeError } from '@/lib/logging';
import { toastPromise } from '@/lib/toast';

jest.mock('react-hot-toast', () => {
  const toastMock = jest.fn();
  return {
    __esModule: true,
    default: Object.assign(toastMock, {
      loading: jest.fn().mockReturnValue('toast-1'),
      dismiss: jest.fn(),
    }),
  };
});

describe('error handling and notifications', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('classifies AppError and serializes fields', () => {
    const error = new AppError({
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
      status: 401,
      details: { path: '/api/private' },
    });

    expect(isAppError(error)).toBe(true);
    expect(serializeError(error)).toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Unauthorized',
    });
  });

  it('resolves exposed and fallback error responses', () => {
    const appError = new AppError({
      message: 'Forbidden',
      code: 'FORBIDDEN',
      status: 403,
      expose: false,
    });

    const resolved = resolveErrorResponse(appError, { fallbackMessage: 'Server error' });
    expect(resolved.status).toBe(403);
    expect(resolved.body).toMatchObject({
      ok: false,
      error: 'Server error',
      message: 'Server error',
      code: 'FORBIDDEN',
    });
    expect(typeof resolved.body.correlationId).toBe('string');
    expect(resolved.headers['x-correlation-id']).toBe(resolved.body.correlationId);

    const fallback = resolveErrorResponse(new Error('Boom'), {
      exposeMessage: true,
      fallbackCode: 'INTERNAL_SERVER_ERROR',
      fallbackStatus: 500,
    });
    expect(fallback.status).toBe(500);
    expect(fallback.body).toMatchObject({
      ok: false,
      error: 'Boom',
      message: 'Boom',
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(typeof fallback.body.correlationId).toBe('string');
  });

  it('logs structured errors', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logError(new Error('Failure'), { route: '/api/test', tenantId: 'tenant-1' });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    // logError emits a single JSON string line (structured logging contract).
    const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      level: 'error',
      context: { route: '/api/test', tenantId: 'tenant-1' },
    });
  });

  it('triggers toast success/error and toastPromise lifecycle', async () => {
    await expect(
      toastPromise(Promise.resolve('ok'), {
        loading: 'Loading',
        success: 'Saved',
        error: 'Failed',
      }),
    ).resolves.toBe('ok');

    await expect(
      toastPromise(Promise.reject(new Error('Nope')), {
        loading: 'Loading',
        success: 'Saved',
        error: 'Failed',
      }),
    ).rejects.toThrow('Nope');

    expect(toast).toHaveBeenCalledWith('Saved', expect.objectContaining({ icon: '✓' }));
    expect(toast).toHaveBeenCalledWith('Failed', expect.objectContaining({ icon: '✕' }));
  });
});
