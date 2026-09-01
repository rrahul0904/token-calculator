import Link from "next/link";
import type { ReactNode } from "react";

export function AppPageHeader({ kicker, title, description, actions }: { kicker: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="app-page-header">
      <div><span className="app-kicker">{kicker}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="app-header-actions">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, detail, warning = false }: { label: string; value: string; detail?: string; warning?: boolean }) {
  return <div className={warning ? "metric-card metric-card--warning" : "metric-card"}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function EmptyState({ title, body, href, action, mark = "TI" }: { title: string; body: string; href?: string; action?: string; mark?: string }) {
  return <div className="empty-state"><div className="empty-state__icon">{mark}</div><h3>{title}</h3><p>{body}</p>{href && action && <Link className="button button--ghost" href={href}>{action}</Link>}</div>;
}

export function Money({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <>Unknown</>;
  return <>{value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`}</>;
}

export function SourceBadge({ source }: { source: string }) {
  const estimated = source === "estimated" || source === "local_tokenizer_reference";
  return <span className={estimated ? "source-badge source-badge--estimated" : "source-badge"}>{source.replaceAll("_", " ")}</span>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "unknown";
  const lower = value.toLowerCase();
  const className = ["completed", "success", "passed", "merged", "approved", "active"].some((item) => lower.includes(item))
    ? "status-badge status-badge--good"
    : ["failed", "aborted", "cancelled", "blocked", "denied"].some((item) => lower.includes(item))
      ? "status-badge status-badge--bad"
      : "status-badge status-badge--warn";
  return <span className={className}>{value.replaceAll("_", " ")}</span>;
}
