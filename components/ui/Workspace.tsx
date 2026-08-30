import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

type Icon = ComponentType<LucideProps>;

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="workspace-page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="workspace-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? (
          <p className="page-subtitle mt-2 max-w-3xl">{description}</p>
        ) : null}
        {meta ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>
        ) : null}
      </div>
      {actions ? <div className="workspace-page-actions">{actions}</div> : null}
    </header>
  );
}

export function WorkspaceSection({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`workspace-section ${className}`.trim()}>
      {title || description || action ? (
        <div className="workspace-section-header">
          <div>
            {title ? <h2 className="section-title">{title}</h2> : null}
            {description ? (
              <p className="section-subtitle mt-1">{description}</p>
            ) : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function WorkspaceCard({
  children,
  className = "",
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "decision";
}) {
  return (
    <div
      className={`workspace-card workspace-card--${tone} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function WorkspaceMetric({
  label,
  value,
  context,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  icon?: Icon;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <article className="workspace-metric">
      <div
        className={`workspace-metric__icon workspace-metric__icon--${tone}`}
        aria-hidden="true"
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
      </div>
      <p className="workspace-metric__label">{label}</p>
      <p className="workspace-metric__value">{value}</p>
      {context ? (
        <div className="workspace-metric__context">{context}</div>
      ) : null}
    </article>
  );
}

export function WorkspaceDecision({
  eyebrow = "Next decision",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <aside className="workspace-decision">
      <div>
        <p className="workspace-decision__eyebrow">{eyebrow}</p>
        <h2 className="workspace-decision__title">{title}</h2>
        {description ? (
          <p className="workspace-decision__description">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="workspace-decision__actions">{actions}</div>
      ) : null}
    </aside>
  );
}
