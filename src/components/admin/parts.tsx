// Small helpers shared by the back-office screens.

import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";

/**
 * Renders `?ok=` / `?error=` from the URL as a banner.
 *
 * Server actions finish with a redirect carrying the message, so this is the one
 * place that decides how success and failure look.
 */
export function Flash({
  ok,
  error,
}: {
  ok?: string;
  error?: string;
}): ReactNode {
  if (error) return <Notice>{error}</Notice>;
  if (ok) return <Notice tone="success">{ok}</Notice>;
  return null;
}

/** Signed, min/max-validated number input shared by every money form. */
export function NumField({
  name,
  label,
  defaultValue,
  step = "any",
  min,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: number;
  step?: string;
  min?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">{label}</span>
      <input
        name={name}
        type="number"
        step={step}
        min={min ?? 0}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
      />
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function TextField({
  name,
  label,
  defaultValue,
  placeholder,
  hint,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
      />
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

/** Labeled checkbox used for every on/off switch in the back office. */
export function Toggle({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        name={name}
        type="checkbox"
        value="1"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
      />
      <span>
        <span className="text-sm text-slate-200">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/** A table row that links to a detail page. */
export function RowLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`font-mono text-xs text-sky-300 hover:text-sky-200 hover:underline ${className}`}>
      {children}
    </Link>
  );
}

/** Machine-pretty key/value view for a JSON-ish column. */
export function JsonView({ raw, empty = "—" }: { raw: string | null | undefined; empty?: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "null");
  } catch {
    return <span className="text-xs text-slate-400">{raw || empty}</span>;
  }
  if (!parsed || typeof parsed !== "object") return <span className="text-xs text-slate-400">{empty}</span>;
  const entries = Object.entries(parsed as Record<string, unknown>).filter(
    ([, v]) => v !== "" && v !== null && v !== undefined,
  );
  if (entries.length === 0) return <span className="text-xs text-slate-400">{empty}</span>;
  return (
    <dl className="space-y-0.5 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="shrink-0 text-slate-500">{k}</dt>
          <dd className="min-w-0 break-all text-slate-300">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Compact pagination: reads `page` from the query string. */
export function pageOf(sp: { page?: string }): number {
  const n = Number.parseInt(sp.page ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Rows per page in every paged back-office list.
 *
 * One constant, imported by both the query and the pager. They used to be
 * independent — `Pager` hardcoded `/ 50` while the ledger page paged by 100 — so
 * that page advertised twice as many pages as existed and "Next" walked the
 * operator onto empty screens.
 */
export const PAGE_SIZE = 20;

export function Pager({
  page,
  total,
  base,
  label = "rows",
  size = PAGE_SIZE,
}: {
  page: number;
  total: number;
  base: string;
  label?: string;
  /** Must be the same constant the query paged by. */
  size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  // The window: first page, last page, and a run either side of the current one,
  // with ellipses where pages were skipped. An operator looking for "the one from
  // Tuesday" should never have to click through forty Nexts.
  const nums: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) nums.push(p);
    else if (nums[nums.length - 1] !== "gap") nums.push("gap");
  }

  const link = (p: number, text: ReactNode, disabled = false) =>
    disabled ? (
      <span
        aria-disabled
        className="cursor-not-allowed rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-600"
      >
        {text}
      </span>
    ) : (
      <Link
        href={`${base}${base.includes("?") ? "&" : "?"}page=${p}`}
        aria-current={p === page ? "page" : undefined}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
          p === page
            ? "bg-sky-500/25 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.4)]"
            : "bg-white/5 text-slate-300 hover:bg-white/10"
        }`}
      >
        {text}
      </Link>
    );

  if (pages <= 1) {
    return <div className="text-xs text-slate-500">{total} {label}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-2 text-xs text-slate-500">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {label}
      </span>
      {link(page - 1, "‹ Prev", page <= 1)}
      {nums.map((n, i) =>
        n === "gap" ? (
          <span key={`gap${i}`} className="px-1 text-xs text-slate-600">
            …
          </span>
        ) : (
          link(n, n, false)
        ),
      )}
      {link(page + 1, "Next ›", page >= pages)}
    </div>
  );
}

/**
 * Filter tabs that are links, not buttons.
 *
 * A tab that changes what a table shows is navigation — it has its own URL, it is
 * bookmarkable, and the back button works. Rendering these as `<button>`s with
 * local state was why the deposit queue could not be linked to directly and why
 * the active tab vanished on refresh.
 *
 * `keep` carries the other active filters forward so switching tab does not
 * silently discard a reference the operator typed.
 */
export function Tabs({
  base,
  active,
  param = "tab",
  keep = {},
  tabs,
}: {
  base: string;
  active: string;
  param?: string;
  keep?: Record<string, string | undefined>;
  tabs: { key: string; label: string; count?: number }[];
}) {
  const href = (key: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
    // `all` is the absence of a filter rather than a value of "all", so the URL
    // stays clean and the default query matches the default view.
    if (key !== "all") q.set(param, key);
    const qs = q.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div
      role="tablist"
      aria-label="Filter"
      className="flex flex-wrap gap-1.5 rounded-2xl border border-white/5 bg-[#35478a] p-1.5"
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={href(t.key)}
            role="tab"
            aria-selected={on}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
              on
                ? "bg-sky-500/20 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.4)]"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                  on ? "bg-sky-400/25 text-sky-100" : "bg-white/10 text-slate-400"
                }`}
              >
                {t.count.toLocaleString()}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}