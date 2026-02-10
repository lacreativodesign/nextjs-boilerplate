import { useState } from "react";
import { showToast } from "@/lib/utils/toast";

export function useLoadingState() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute<T>(
    fn: () => Promise<T>,
    options?: {
      successMessage?: string;
      errorMessage?: string;
      onSuccess?: (data: T) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<T | null> {
    try {
      setLoading(true);
      setError(null);

      const result = await fn();

      if (options?.successMessage) {
        showToast.success(options.successMessage);
      }

      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);

      showToast.error(options?.errorMessage || errorMessage);
      options?.onError?.(err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, execute };
}
