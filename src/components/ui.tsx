// Small presentational primitives shared by the player area and the back office.
//
// Kept as plain server components (no "use client") so pages can pass event
// handlers down to their own client children without a provider in between.

import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------- panel */

export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClass = "p-5",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/5 bg-[#35478a] ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
          <h3 className="text-sm font-bold tracking-wide text-slate-200">{title}</h3>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------- stat */

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "text-slate-100",
    good: "text-emerald-300",
    warn: "text-amber-300",
    bad: "text-rose-300",
  }[tone];
  return (
    <div className="rounded-2xl border border-white/5 bg-[#35478a] p-4">
      <div className="text-[10px] tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- badge */

const STATUS_TONE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  cancel: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  blocked: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  open: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  answered: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  closed: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  success: "Success",
  pending: "Pending",
  cancel: "Cancelled",
  active: "Active",
  blocked: "Blocked",
  open: "Open",
  answered: "Answered",
  closed: "Closed",
  approved: "Approved",
  rejected: "Rejected",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "bg-white/5 text-slate-300 ring-white/10";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${tone}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500";

export const selectClass = `${inputClass} appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-9`;

/* ----------------------------------------------------------------- buttons */

const BUTTON_TONES = {
  primary:
    "bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_0_20px_rgba(56,189,248,0.35)] hover:brightness-110",
  gold: "bg-gradient-to-r from-amber-500 to-yellow-400 text-black hover:brightness-110",
  good: "bg-gradient-to-r from-emerald-600 to-emerald-400 text-white hover:brightness-110",
  danger: "bg-gradient-to-r from-rose-700 to-rose-500 text-white hover:brightness-110",
  ghost: "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
} as const;

export function Button({
  tone = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BUTTON_TONES }) {
  return (
    <button
      {...props}
      className={`rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_TONES[tone]} ${className}`}
    />
  );
}

export function ButtonLink({
  href,
  tone = "primary",
  className = "",
  children,
}: {
  href: string;
  tone?: keyof typeof BUTTON_TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-block rounded-xl px-5 py-3 text-sm font-bold transition ${BUTTON_TONES[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------- table */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.15em] text-slate-400">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------- empty/error */

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function Notice({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "success";
  children: ReactNode;
}) {
  const toneClass = {
    error: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`} role="alert">
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}