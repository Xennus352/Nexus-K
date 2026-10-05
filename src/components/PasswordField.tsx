"use client";

// Password input with a reveal toggle.
//
// Rendered as a real client component (rather than a CSS-only trick) because the
// toggle has to flip the input's `type`, and because it is used from both the
// player sign-in and the staff portal — `next/navigation` and server actions both
// render these, so it must not pull either into a client bundle.

import { useId, useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordField({
  className,
  ...props
}: ComponentPropsWithoutRef<"input">) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className="relative">
      <input
        {...props}
        id={id}
        type={shown ? "text" : "password"}
        className={`${className ?? ""} pr-12`}
      />
      <button
        type="button"
        // `showPassword` matches the ARIA spec's expected toggle label.
        aria-pressed={shown}
        aria-controls={id}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((v) => !v)}
        className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-300/80 transition hover:bg-white/10 hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        {shown ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
      </button>
    </div>
  );
}