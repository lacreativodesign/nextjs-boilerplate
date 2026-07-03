import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
  xl: 'h-16 w-16 border-4',
};

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={cn(
          'animate-spin rounded-full border-[var(--border-subtle)] border-t-[var(--erp-blue)]',
          sizeClasses[size],
          className,
        )}
        role="status"
        aria-label={label || 'Loading'}
      />
      {label && <span className="text-sm text-[var(--text-muted)]">{label}</span>}
    </div>
  );
}
