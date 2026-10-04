// Which games a player is allowed to see.
//
// Every game in the two catalogues (the engine's, and this app's local games) is on
// a row, with its operator override filled in from the sparse GameFlag table or the
// "visible, in service" default. One form per row saves that game's override; a
// saved override exists, and a cleared one drops the row back to the default.
//
// The table is the only place a game's visibility is decided, which is why it
// lists hidden and suspended games too — a game removed from the lobby is still
// listed here so that wiring can bring it back.

import { requireAdmin } from "@/lib/admin-session";
import { PageTitle, Panel, Button } from "@/components/ui";
import { Flash, NumField, PAGE_SIZE, Pager, Tabs, TextField, Toggle, pageOf } from "@/components/admin/parts";
import { allFlags, LOCAL_GAMES, type EngineGame } from "@/lib/games";
import { saveGameFlagAction, clearGameFlagAction } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

const ENGINE = process.env.SLOTOPOL_URL ?? "http://localhost:8080";

const TABS = [
  { key: "all", label: "All" },
  { key: "visible", label: "Visible" },
  { key: "hidden", label: "Hidden" },
  { key: "maint", label: "Maintenance" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string; ok?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const page = pageOf(sp);

  let engineGames: EngineGame[] = [];
  let engineError = false;
  try {
    const res = await fetch(`${ENGINE}/game/list?inc=all&exc=~all&sort=true`, { cache: "no-store" });
    engineGames = ((await res.json()).list ?? [])
      .filter((g: { gt: number }) => g.gt === 1)
      .map((g: { prov: string; name: string; sx: number; sy: number; rtp: number[] }) => ({
        prov: g.prov,
        name: g.name,
        sx: g.sx,
        sy: g.sy,
        rtp: g.rtp,
      }));
  } catch {
    engineError = true;
  }

  const flags = await allFlags();

  const rows = [
    ...LOCAL_GAMES.map((g) => ({ key: g.key, title: g.title, prov: g.prov, local: true })),
    ...engineGames.map((g) => ({ key: `${g.prov}/${g.name}`, title: g.name, prov: g.prov, local: false })),
  ].map((g) => {
    const f = flags.get(g.key);
    const visible = f ? f.visible : true;
    const maint = f ? f.maint : false;
    return { ...g, visible, maint, note: f?.note ?? "", maintNote: f?.maintNote ?? "", sort: f?.sort ?? 0, flagged: !!f };
  });

  const shown = rows.filter((g) => {
    if (tab === "visible" && !g.visible) return false;
    if (tab === "hidden" && g.visible) return false;
    if (tab === "maint" && !g.maint) return false;
    if (q && !`${g.prov} ${g.title}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const base = `/admin/games?${tab !== "all" ? `tab=${tab}&` : ""}${q ? `q=${encodeURIComponent(q)}&` : ""}`;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageNum = Math.min(page, pages);
  const pageRows = shown.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);

  const counts = {
    all: rows.length,
    visible: rows.filter((g) => g.visible).length,
    hidden: rows.filter((g) => !g.visible).length,
    maint: rows.filter((g) => g.maint).length,
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="Games"
        subtitle={admin.role === "superadmin" ? "Control which games players can see, and which are under maintenance" : "Read-only — superadmin access required to change anything"}
      />

      <Flash ok={sp.ok} error={sp.error} />

      {engineError && (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          The engine did not answer, so only the local games are listed. Start `./engine/slotopol web` and
          reload to see the rest.
        </div>
      )}

      <Panel title="GAME VISIBILITY & MAINTENANCE">
        <p className="mb-4 text-xs text-slate-500">
          A game with no override row is live by default. Hiding a game removes it from the lobby and stops it
          opening. Maintenance keeps it listed but shows a &lsquo;this game is being worked on&rsquo; screen when opened.
        </p>

        <form className="mb-4 flex items-center gap-3">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="🔍 Search games…"
            className="flex-1 rounded-xl border border-white/10 bg-[#2b3a6e] px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
          />
          <Button type="submit" tone="ghost">Search</Button>
        </form>

        <Tabs
          base="/admin/games"
          active={tab}
          param="tab"
          keep={{ q: sp.q }}
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))}
        />

        <div className="mt-4 space-y-3">
          {pageRows.length === 0 && (
            <p className="rounded-2xl border border-white/5 bg-[#1b2a5e] p-6 text-sm text-slate-400">
              No games in this view.
            </p>
          )}
          {pageRows.map((g) => (
            <details key={g.key} className="group rounded-2xl border border-white/5 bg-[#1b2a5e] open:bg-[#20301f]/50">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${g.visible ? (g.maint ? "bg-amber-400" : "bg-emerald-400") : "bg-slate-600"}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">{g.title}</span>
                <span className="text-xs text-slate-500">{g.prov}</span>
                {g.local && <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">LOCAL</span>}
                {g.maint && <span className="rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">MAINT</span>}
                {!g.visible && <span className="rounded-md bg-slate-600/40 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">HIDDEN</span>}
              </summary>
              <div className="border-t border-white/5 px-4 py-4">
                <form action={saveGameFlagAction} className="space-y-4">
                  <input type="hidden" name="alias" value={g.key} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Toggle name="visible" label="Visible to players" defaultChecked={g.visible} hint="Off takes the game out of the lobby and stops its screen loading." />
                    <Toggle name="maint" label="Under maintenance" defaultChecked={g.maint} hint="Listed in the lobby, but opens to an 'under maintenance' screen." />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <NumField name="sort" label="SORT (higher first)" defaultValue={g.sort} hint="0 keeps the upstream order." />
                    <TextField name="note" label="INTERNAL NOTE" defaultValue={g.note} hint="Never shown to players." />
                    <TextField name="maintNote" label="MAINTENANCE MESSAGE" defaultValue={g.maintNote} hint="Shown to players when this game is suspended." />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">Save game</Button>
                  </div>
                </form>
                {g.flagged && (
                  <form action={clearGameFlagAction} className="mt-2">
                    <input type="hidden" name="alias" value={g.key} />
                    <Button type="submit" tone="ghost">Reset to default</Button>
                  </form>
                )}
              </div>
            </details>
          ))}
        </div>

        <Pager base={base} page={pageNum} total={shown.length} label="games" />
      </Panel>
    </div>
  );
}