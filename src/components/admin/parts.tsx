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

export function Pager({
  page,
  total,
  base,
  label = "rows",
}: {
  page: number;
  total: number;
  base: string;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / 50));
  if (pages <= 1) return <div className="text-xs text-slate-500">{total} {label}</div>;

  const link = (p: number, text: string, disabled = false) =>
    disabled ? (
      <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-600">{text}</span>
    ) : (
      <Link
        href={`${base}${base.includes("?") ? "&" : "?"}page=${p}`}
        className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
      >
        {text}
      </Link>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-2 text-xs text-slate-500">
        Page {page} of {pages} · {total} {label}
      </span>
      {link(page - 1, "Previous", page <= 1)}
      {link(page + 1, "Next", page >= pages)}
    </div>
  );
}