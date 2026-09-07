import Link from "next/link";
import type { ReactNode } from "react";

type MetricTone = "default" | "cost" | "good" | "warning" | "risk" | "policy";

export function AppPageHeader({ kicker, title, description, actions }: { kicker: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="app-page-header">
      <div className="app-page-header__copy">
        <span className="app-kicker"><span className="app-kicker__dot" aria-hidden="true" />{kicker}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="app-header-actions">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, detail, warning = false, tone = "default", eyebrow }: { label: string; value: string; detail?: string; warning?: boolean; tone?: MetricTone; eyebrow?: string }) {
  const resolvedTone = warning ? "warning" : tone;
  return (
    <article className={`metric-card metric-card--${resolvedTone}`}>
      <div className="metric-card__top">
        <span>{label}</span>
        <span className="metric-card__signal" aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
      {eyebrow && <span className="metric-card__eyebrow">{eyebrow}</span>}
    </article>
  );
}

export function EmptyState({ title, body, href, action, mark = "TI" }: { title: string; body: string; href?: string; action?: string; mark?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{mark}</div>
      <div><h3>{title}</h3><p>{body}</p></div>
      {href && action && <Link className="button button--ghost" href={href}>{action}<span aria-hidden="true"> →</span></Link>}
    </div>
  );
}

export function Money({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <>Unknown</>;
  return <>{value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`}</>;
}

export function SourceBadge({ source }: { source: string }) {
  const lower = source.toLowerCase();
  const modifier =
    lower === "experiment_verified" ? "verified"
      : lower === "provider_measured" || lower.includes("reconciled") || lower.includes("actual") ? "measured"
        : lower === "historically_observed" ? "observed"
          : lower === "counterfactual_estimate" ? "counterfactual"
            : lower === "unavailable" || lower === "insufficient_sample" || lower === "results_recorded" || lower === "not_configured" || lower === "not configured" ? "unavailable"
              : "estimated";
  return <span className={`source-badge source-badge--${modifier}`}><span className="source-badge__dot" aria-hidden="true" />{source.replaceAll("_", " ")}</span>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "unknown";
  const lower = value.toLowerCase();
  const modifier = ["completed", "success", "passed", "merged", "approved", "active", "connected", "verified"].some((item) => lower.includes(item))
    ? "good"
    : ["failed", "aborted", "cancelled", "blocked", "denied", "error", "critical"].some((item) => lower.includes(item))
      ? "bad"
      : "warn";
  return <span className={`status-badge status-badge--${modifier}`}><span aria-hidden="true" className="status-badge__dot" />{value.replaceAll("_", " ")}</span>;
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="app-panel__header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function DataTruthStrip() {
  return (
    <div className="data-truth-strip" aria-label="Economics evidence labels">
      <span>Evidence states</span>
      <SourceBadge source="estimated" />
      <SourceBadge source="provider_measured" />
      <SourceBadge source="counterfactual_estimate" />
      <SourceBadge source="experiment_verified" />
    </div>
  );
}
