import React from 'react';
import Spinner from '@/components/ui/Spinner';

type LoadingButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingText?: string;
};

export default function LoadingButton({
  loading = false,
  loadingText = 'Loading...',
  disabled,
  children,
  className = '',
  ...props
}: LoadingButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={loading}
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <span className={loading ? 'invisible' : 'inline-flex items-center gap-2'}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-2">
          <Spinner size="sm" />
          <span>{loadingText}</span>
        </span>
      )}
    </button>
  );
}
