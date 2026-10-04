"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface CoinGrantNotice {
  id: string;
  amount: number;
  reason: string;
  timestamp: number;
}

const NOTICES_KEY = "nk_coin_grants";

/**
 * Client-side coin grant notifications with sound and animation.
 * Stores notices in localStorage so they persist across navigations,
 * and plays a celebratory sound when a new grant arrives.
 */
export function useCoinGrantNotices() {
  const [notices, setNotices] = useState<CoinGrantNotice[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Load from localStorage on mount - deferred to avoid sync setState in effect
  useEffect(() => {
    let mounted = true;
    try {
      const stored = localStorage.getItem(NOTICES_KEY);
      if (stored && mounted) {
        const parsed = JSON.parse(stored) as CoinGrantNotice[];
        // Only show notices from the last 7 days
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        // Defer to next tick to avoid sync setState warning
        setTimeout(() => {
          if (mounted) setNotices(parsed.filter((n) => n.timestamp > cutoff));
        }, 0);
      }
    } catch {
      // Ignore parse errors
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Play a pleasant coin grant sound
  const playGrantSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      // A cheerful two-tone "coins received" sound
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";
      osc1.frequency.value = 880; // A5
      osc2.frequency.value = 1318.5; // E6 (perfect fifth)

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);

      // Add a subtle "coin drop" click at the start
      const click = ctx.createOscillator();
      const clickGain = ctx.createGain();
      click.type = "square";
      click.frequency.value = 2000;
      click.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickGain.gain.setValueAtTime(0, now);
      clickGain.gain.linearRampToValueAtTime(0.1, now + 0.001);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      click.start(now);
      click.stop(now + 0.1);
    } catch {
      // Audio not available or blocked
    }
  };

  const addNotice = (amount: number, reason: string) => {
    const notice: CoinGrantNotice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      reason,
      timestamp: Date.now(),
    };
    setNotices((prev) => {
      const next = [notice, ...prev].slice(0, 20);
      try {
        localStorage.setItem(NOTICES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
    playGrantSound();
  };

  const dismiss = (id: string) => {
    setNotices((prev) => {
      const next = prev.filter((n) => n.id !== id);
      try {
        localStorage.setItem(NOTICES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const clearAll = () => {
    setNotices([]);
    try {
      localStorage.removeItem(NOTICES_KEY);
    } catch {
      // Ignore
    }
  };

  const toggleSound = () => setSoundEnabled((s) => !s);

  return { notices, addNotice, dismiss, clearAll, soundEnabled, toggleSound };
}

/**
 * Toast component that animates in and out with a nice gold shimmer.
 */
export function CoinGrantToast({
  notice,
  onDismiss,
}: {
  notice: CoinGrantNotice;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss after 8 seconds
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(notice.id), 400);
    }, 8000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!visible && exiting) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-4 w-[360px] rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-amber-500/10 p-4 shadow-[0_10px_40px_rgba(255,180,0,0.3)] backdrop-blur-xl animate-${exiting ? "slide-out" : "slide-in"}`}
      style={{
        animationDuration: "400ms",
        animationFillMode: "forwards",
      }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-shrink-0 relative">
        <div className="relative h-14 w-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_20px_rgba(255,180,0,0.6)]">
          <svg className="h-7 w-7 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.759 1.111a19.95 19.95 0 016.762 0A19.95 19.95 0 0124 9.756a19.95 19.95 0 01-6.762 0A19.95 19.95 0 0112 8z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 16c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" />
          </svg>
        </div>
        {/* Pulsing ring */}
        <div className="absolute inset-0 rounded-xl border-2 border-amber-300/50 animate-ping opacity-75" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-amber-50 text-slate-900">COINS GRANTED</p>
        <p className="text-2xl font-black text-amber-300 tabular-nums">+{notice.amount.toLocaleString()}</p>
        <p className="text-xs text-amber-200/80 truncate">{notice.reason}</p>
      </div>

      <button
        onClick={() => {
          setExiting(true);
          setTimeout(() => onDismiss(notice.id), 400);
        }}
        className="flex-shrink-0 p-1 rounded-lg text-amber-300/70 hover:text-amber-100 hover:bg-amber-400/20 transition"
        aria-label="Dismiss"
      >
        <X className="h-5 w-5" />
      </button>

      <style jsx>{`
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(120%) scale(0.95); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes slide-out {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to { opacity: 0; transform: translateX(120%) scale(0.95); }
        }
      `}</style>
    </div>
  );
}

/**
 * Container that renders all active coin grant toasts stacked vertically.
 */
export function CoinGrantToastContainer() {
  const { notices, dismiss } = useCoinGrantNotices();

  if (notices.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      {notices.map((notice) => (
        <div className="pointer-events-auto" key={notice.id}>
          <CoinGrantToast notice={notice} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}