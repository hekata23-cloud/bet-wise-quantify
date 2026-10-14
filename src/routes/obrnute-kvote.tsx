import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { analizirajObrnuto } from "@/lib/obrnute-kvote";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { getApiKey, guarded, resetGuard, zagrebDay } from "@/lib/zlatni-guard";
import { SettingsModal } from "@/components/SettingsModal";

export const Route = createFileRoute("/obrnute-kvote")({
  head: () => ({
    meta: [
      { title: "Detektor obrnutih kvota · Andromeda AI" },
      { name: "description", content: "Otkrij kad je jeftina kvota zamka: provjera 2.5 golova i BTTS prema 1X2 slici utakmice." },
      { property: "og:title", content: "Detektor obrnutih kvota · Andromeda AI" },
      { property: "og:description", content: "Kad Manje 2.5 @1.65 izgleda sigurno, a stvarno prolazi Više — ovdje to vidiš unaprijed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const POLJA = [["k1", "1"], ["kx", "X"], ["k2", "2"], ["kOver", "Više 2.5"], ["kUnder", "Manje 2.5"], ["kGG", "GG"], ["kNG", "NG"]] as const;
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function Page() {
  const [v, setV] = useState<Record<string, string>>({ k1: "2.10", kx: "3.40", k2: "3.50", kOver: "2.40", kUnder: "1.65", kGG: "1.80", kNG: "2.00" });
  const [fx, setFx] = useState<ZtFixture[]>([]);
  const [sel, setSel] = useState<ZtFixture | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const wait = (ms: number, why: string) => setMsg(`Zaštita API-ja: ${why}. Čekam ${Math.ceil(ms / 1000)} s…`);
  const err = (e: string) => e === "RATE_LIMIT" ? "Limit API-ja — pričekaj malo." : e.startsWith("ACCOUNT") ? "Problem s API računom/ključem." : e;

  const loadDay = async () => {
    const apiKey = getApiKey(); if (!apiKey) { setSettings(true); return setMsg("Upiši API-Football ključ u Postavkama."); }
    setBusy(true);
    try {
      const r = await guarded("fixtures", 1, () => getZtFixtures({ data: { date: zagrebDay(), apiKey } }), wait);
      if (r.error) setMsg(err(r.error));
      else { const l = r.fixtures.filter((f) => ["NS", "TBD"].includes(f.status)).sort((a, b) => a.time.localeCompare(b.time)); setFx(l); setMsg(`${l.length} utakmica danas. Ponovno učitavanje danas je besplatno.`); }
    } catch (e: any) { setMsg(e?.message ?? "Greška"); } finally { setBusy(false); }
  };
  const pick = async (f: ZtFixture) => {
    const apiKey = getApiKey(); if (!apiKey || busy) return;
    setSel(f); setBusy(true); setMsg(`Učitavam kvote: ${f.home} — ${f.away}…`);
    try {
      const r = await guarded(`lite.${f.id}`, 1, () => getZtMatch({ data: { id: f.id, apiKey, lite: true } }), wait);
      if (r.error && !Object.keys(r.markets).length) return setMsg(err(r.error));
      const m = r.markets; const g = (re: RegExp) => Object.entries(m).find(([k]) => re.test(k))?.[1] ?? {};
      const w = g(/^match winner$/i), ou = g(/^goals over\/under$/i), bt = g(/^both teams (to )?score$/i);
      const s = (x?: number) => (x ? x.toFixed(2) : "");
      setV({ k1: s(w["Home"]), kx: s(w["Draw"]), k2: s(w["Away"]), kOver: s(ou["Over 2.5"]), kUnder: s(ou["Under 2.5"]), kGG: s(bt["Yes"]), kNG: s(bt["No"]) });
      setMsg(w["Home"] ? `Kvote učitane (${r.bookmaker ?? "kladionica"}) — tipovi su ispod.` : "Nema 1X2 kvota za ovu utakmicu.");
    } catch (e: any) { setMsg(e?.message ?? "Greška"); } finally { setBusy(false); }
  };
  const list = fx.filter((f) => `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(q.toLowerCase())).slice(0, 80);

  const r = useMemo(() => {
    const n = (k: string) => Number((v[k] ?? "").replace(",", "."));
    return analizirajObrnuto({ k1: n("k1"), kx: n("kx"), k2: n("k2"), kOver: n("kOver"), kUnder: n("kUnder"), kGG: n("kGG"), kNG: n("kNG") });
  }, [v]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">🪤 Detektor obrnutih kvota</h1>
        <p className="text-sm text-muted-foreground">Kladionica često snizi stranu koju svi igraju. Ovdje se 2.5 golova i BTTS provjeravaju prema 1X2 slici — ako se ne slažu, jeftina strana je zamka.</p>
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={loadDay} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Učitaj utakmice dana</button>
          <button onClick={() => setSettings(true)} className="rounded-lg border border-border px-3 py-2 text-sm">Postavke (API ključ)</button>
          <button onClick={() => { resetGuard(); setMsg("Blokada poništena."); }} className="rounded-lg border border-border px-3 py-2 text-sm">Poništi blokadu</button>
          {fx.length > 0 && <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Traži tim ili ligu…" value={q} onChange={(e) => setQ(e.target.value)} />}
        </div>
        <p className="text-xs text-muted-foreground">Zaštita: 1 kredit za popis dana, 1 kredit po utakmici, sve se pamti do kraja dana (ponovni klik je besplatan).</p>
        {msg && <p className="text-sm">{msg}</p>}
        {fx.length > 0 && <div className="max-h-64 space-y-1 overflow-y-auto">{list.map((f) => (
          <button key={f.id} disabled={busy} onClick={() => pick(f)} className={`flex w-full gap-2 rounded-lg px-3 py-2 text-left text-sm ${sel?.id === f.id ? "bg-primary/15 text-primary" : "bg-muted/40 hover:bg-muted"}`}>
            <span className="shrink-0 tabular-nums">{new Date(f.time).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="min-w-0 flex-1 truncate">{f.home} — {f.away}</span>
            <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground md:inline">{f.league}</span>
          </button>))}</div>}
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-7">
        {POLJA.map(([k, l]) => (
          <label key={k} className="text-xs text-muted-foreground">{l}
            <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground tabular-nums" />
          </label>
        ))}
      </div>
      {!r && <div className="text-sm text-muted-foreground">Unesi kvote 1, X i 2.</div>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Box k="Očekivani golovi (1X2)" v={(r.lh + r.la).toFixed(2)} />
            <Box k="λ domaćin / gost" v={`${r.lh.toFixed(2)} / ${r.la.toFixed(2)}`} />
            <Box k="Pošteni Više 2.5" v={pct(r.pOver)} />
            <Box k="Pošteni GG" v={pct(r.pBtts)} />
          </div>
          {r.signali.map((s) => (
            <div key={s.trziste} className={`rounded-xl border p-4 ${s.razina === "ZAMKA" ? "border-destructive bg-destructive/10" : s.razina === "SUMNJIVO" ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{s.trziste}</span>
                <span>{s.razina === "ZAMKA" ? "⚠️ ZAMKA" : s.razina === "SUMNJIVO" ? "Sumnjivo" : "✓ Usklađeno"}</span>
              </div>
              <p className="mt-1 text-sm">{s.tekst}</p>
              <div className="mt-2 text-xs tabular-nums text-muted-foreground">
                „{s.skupa}": tržište {pct(s.pTrzista)} · model {pct(s.pModela)} · razlika {(s.razlika * 100).toFixed(1)} pp
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Signal nije jamstvo — pokazuje gdje kvota proturječi ostatku ponude. Igraj manji ulog na „skupu" stranu samo kod oznake ZAMKA.</p>
        </>
      )}
      <SettingsModal open={settings} onClose={() => setSettings(false)} onSaved={() => setSettings(false)} />
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-muted/50 p-2"><div className="text-[11px] text-muted-foreground">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>;
}
