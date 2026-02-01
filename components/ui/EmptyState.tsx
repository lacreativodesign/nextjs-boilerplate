"use client";

type EmptyStateProps = {
  title: string;
  description: string;
  hint?: string;
  compact?: boolean;
};

export default function EmptyState({ title, description, hint, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? " empty-state--compact" : ""}`}>
      <div className="empty-state__badge" aria-hidden="true" />
      <div className="empty-state__title">{title}</div>
      <div className="empty-state__description">{description}</div>
      {hint && <div className="empty-state__hint">{hint}</div>}
    </div>
  );
}
