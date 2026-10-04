// Clipboard helper.
//
// Several screens show a reference that the player has to copy verbatim (bank
// details, referral codes). A delegated click handler keeps that working without
// turning each screen into a client component.
"use client";

import { useEffect } from "react";

export default function CopyButton() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-copy]");
      const value = target?.dataset.copy;
      if (!value) return;
      void navigator.clipboard?.writeText(value).then(() => {
        const original = target.textContent;
        target.textContent = "Copied";
        setTimeout(() => {
          target.textContent = original;
        }, 1200);
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}