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

    expect(resolveErrorResponse(appError, { fallbackMessage: 'Server error' })).toEqual({
      status: 403,
      body: {
        ok: false,
        error: 'Server error',
        code: 'FORBIDDEN',
        details: undefined,
        requestId: undefined,
      },
    });

    expect(
      resolveErrorResponse(new Error('Boom'), {
        exposeMessage: true,
        fallbackCode: 'INTERNAL_SERVER_ERROR',
        fallbackStatus: 500,
      }),
    ).toEqual({
      status: 500,
      body: {
        ok: false,
        error: 'Boom',
        code: 'INTERNAL_SERVER_ERROR',
        requestId: undefined,
      },
    });
  });

  it('logs structured errors', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logError(new Error('Failure'), { route: '/api/test', tenantId: 'tenant-1' });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toMatchObject({
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
