import toast from "react-hot-toast";

const baseStyle = {
  borderRadius: "12px",
  background: "var(--toast-bg)",
  color: "var(--toast-text)",
  border: "1px solid var(--toast-border)",
  boxShadow: "var(--toast-shadow)",
  fontFamily: "Inter, system-ui",
};

const variantBorder = {
  success: "var(--toast-success)",
  error: "var(--toast-error)",
  warning: "var(--toast-warning)",
  info: "var(--toast-info)",
} as const;

function resolveStyle(variant: keyof typeof variantBorder) {
  return {
    ...baseStyle,
    borderLeft: `4px solid ${variantBorder[variant]}`,
  } as const;
}

export function toastSuccess(message: string): void {
  toast(message, {
    icon: "✓",
    duration: 3000,
    style: resolveStyle("success"),
  });
}

export function toastError(message: string): void {
  toast(message, {
    icon: "✕",
    duration: 5000,
    style: resolveStyle("error"),
  });
}

export function toastWarning(message: string): void {
  toast(message, {
    icon: "⚠",
    duration: 4000,
    style: resolveStyle("warning"),
  });
}

export function toastInfo(message: string): void {
  toast(message, {
    icon: "ℹ",
    duration: 3000,
    style: resolveStyle("info"),
  });
}

export function toastLoading(message: string): string {
  return toast.loading(message, {
    style: resolveStyle("info"),
  });
}

export function toastDismiss(id: string): void {
  toast.dismiss(id);
}

export async function toastPromise<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string; error: string | ((err: any) => string) }
): Promise<T> {
  const id = toastLoading(messages.loading);
  try {
    const result = await promise;
    toastSuccess(messages.success);
    return result;
  } catch (err: any) {
    const message = typeof messages.error === "function" ? messages.error(err) : messages.error;
    toastError(message);
    throw err;
  } finally {
    toastDismiss(id);
  }
}
