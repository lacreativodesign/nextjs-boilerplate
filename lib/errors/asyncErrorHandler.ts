import { showToast } from '@/lib/utils/toast';

interface AsyncErrorOptions {
  errorMessage?: string;
  rethrow?: boolean;
  onError?: (error: Error) => void;
}

export async function handleAsyncError<T>(
  fn: () => Promise<T>,
  options?: AsyncErrorOptions,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    console.error('Async Error:', error);
    showToast.error(options?.errorMessage || errorMessage);

    if (options?.onError && error instanceof Error) {
      options.onError(error);
    }

    if (options?.rethrow) {
      throw error;
    }

    return null;
  }
}
