/* ============================================================
   O/U 0.5 & 1.5 — NISKA TRŽIŠTA pod mikroskopom
   Motor: goals-motor.ts (Poisson + Dixon-Coles + kalibracija)
   Over 0.5  = 1 − P(0:0) iz matrice rezultata
   Over 1.5  = direktno iz matrice (kalibrirano tržištem)
   1H Over 0.5 = 1 − exp(−0.44·λ ukupno)
   Svaka analiza nosi Data Precision Score, a tipovi idu u Korpu.
   ============================================================ */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Gauge, RefreshCw, Search,
  ShieldCheck, ShoppingCart, Target,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { getGoalsBundle, getGoalsUtakmice, type GoalsBundle, type GoalsUtakmica } from "@/lib/goals.functions";
import { goalsAnaliza, type GoalsIzlaz } from "@/lib/goals-motor";
import { ouNiskiIzAnalize, ouTiket, preciznostOcjena, type OuNiskiIzlaz } from "@/lib/ou-niski";
import { getApiKey, zagrebDay } from "@/lib/zlatni-guard";
import { dodajUKorpu } from "@/lib/korpa";
import { zapisiTip } from "@/lib/dnevnik";

export const Route = createFileRoute("/ou-niski")({
  head: () => ({
    meta: [{ title: "O/U 0.5 & 1.5 · Niska tržišta · Precision Check" }],
  }),
  component: OuNiskiPage,
});

type Linija = "05" | "15";
type Rezultat = { bundle: GoalsBundle; analiza: GoalsIzlaz; niski: OuNiskiIzlaz };

function fmtPct(x: number) { return `${(x * 100).toFixed(1)}%`; }
function vrijeme(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function razinaBoja(r: string) {
  if (r === "A+") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (r === "A") return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  if (r === "B") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-slate-500/20 text-slate-300 border-slate-500/40";
}
function Traka({ p, label, boja }: { p: number; label: string; boja: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${boja}`} style={{ width: `${Math.min(100, p * 100)}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-xs font-bold text-foreground">{fmtPct(p)}</span>
    </div>
  );
}

function OuNiskiPage() {
  const [date, setDate] = useState(zagrebDay());
  const [tab, setTab] = useState<Linija>("05");
  const [utakmice, setUtakmice] = useState<GoalsUtakmica[]>([]);
  const [status, setStatus] = useState("");
  const [ucitam, setUcitam] = useState(false);
  const [trazim, setTrazim] = useState("");
  const [odabrana, setOdabrana] = useState<GoalsUtakmica | null>(null);
  const [radim, setRadim] = useState<number | null>(null);
  const [rez, setRez] = useState<Record<number, Rezultat>>({});
  const [kvota05, setKvota05] = useState("");
  const [settings, setSettings] = useState(false);

  const rezKljuc = (dan: string) => `oun.rez.v1.${dan}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(rezKljuc(zagrebDay()));
      if (raw) setRez(JSON.parse(raw) as Record<number, Rezultat>);
    } catch { /* ignoriraj */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spremiRez = (dan: string, novi: Record<number, Rezultat>) => {
    try { localStorage.setItem(rezKljuc(dan), JSON.stringify(novi)); } catch { /* ignoriraj */ }
  };

  const ucitaj = async (force = false) => {
    const apiKey = getApiKey();
    if (!apiKey) { setStatus("Prvo unesi API-Football ključ u Postavkama (⚙️)."); setSettings(true); return; }
    setUcitam(true);
    setStatus(`Učitavam utakmice za ${date}…`);
    const ck = `oun.fix.v1.${date}`;
    try {
      const kes = force ? null : localStorage.getItem(ck);
      const r = kes ? (JSON.parse(kes) as { error: string | null; utakmice: GoalsUtakmica[] })
        : await getGoalsUtakmice({ data: { date, apiKey } });
      if (!force && !kes) localStorage.setItem(ck, JSON.stringify(r));
      if (r.error) { setUtakmice([]); setStatus(`Učitavanje nije uspjelo: ${r.error}`); }
      else {
        setUtakmice(r.utakmice);
        setStatus(r.utakmice.length ? `Učitano ${r.utakmice.length} utakmica. Klikni utakmicu za 0.5 / 1.5 analizu.` : "Nema nadolazećih utakmica za taj dan.");
      }
    } catch { setStatus("Greška pri dohvatu utakmica."); }
    setUcitam(false);
  };

  const analiziraj = async (u: GoalsUtakmica): Promise<boolean> => {
    const apiKey = getApiKey();
    if (!apiKey) { setStatus("Nedostaje API ključ."); setSettings(true); return false; }
    setOdabrana(u);
    if (rez[u.id]) { setKvota05(""); return true; }
    setRadim(u.id);
    setStatus(`Analiziram ${u.home} — ${u.away}…`);
    const ck = `oun.bundle.v1.${u.id}`;
    try {
      const kes = localStorage.getItem(ck);
      const bundle = kes ? (JSON.parse(kes) as GoalsBundle) : await getGoalsBundle({ data: { id: u.id, homeId: u.homeId, awayId: u.awayId, apiKey } });
      if (!kes) localStorage.setItem(ck, JSON.stringify(bundle));
      // Motor UVIJEK radi — i kad bundle ima grešku ili nema kvota (samo forma).
      const analiza = goalsAnaliza({
        kvote: bundle.kvote ?? {},
        formaDom: bundle.formaDom,
        formaGost: bundle.formaGost,
        brojKladionica: bundle.knjigaOu,
      });
      const niski = ouNiskiIzAnalize(analiza);
      const novi = { ...rez, [u.id]: { bundle, analiza, niski } };
      setRez(novi);
      spremiRez(date, novi);
      setRadim(null);
      setStatus(`Gotovo — P(Over 0.5) ${fmtPct(niski.o05)} · P(Over 1.5) ${fmtPct(niski.o15)}`);
      return true;
    } catch {
      setRadim(null);
      setStatus("Analiza nije uspjela (API zauzet) — probaj za minutu.");
      return false;
    }
  };

  const analizirajPrvih = async () => {
    const lista = utakmice.filter((u) => !rez[u.id]).slice(0, 3);
    if (!lista.length) { setStatus("Sve prikazane utakmice su već analizirane."); return; }
    for (let i = 0; i < lista.length; i++) {
      setStatus(`Auto-analiza ${i + 1}/${lista.length}: ${lista[i]!.home} — ${lista[i]!.away}…`);
      const ok = await analiziraj(lista[i]!);
      if (!ok) { setStatus("Auto-analiza zaustavljena radi zaštite API-ja."); return; }
    }
    setStatus(`Gotovo — analizirano ${lista.length} utakmica kroz Poisson/Dixon-Coles motor.`);
  };

  const filtrirane = utakmice.filter(
    (u) => !trazim || `${u.home} ${u.away} ${u.league} ${u.country}`.toLowerCase().includes(trazim.toLowerCase()),
  );

  const trenutni = odabrana ? rez[odabrana.id] : undefined;
  const zauzet = radim != null || ucitam;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Target className="h-5 w-5 text-primary" /> O/U 0.5 &amp; 1.5 — Niska tržišta</h1>
          <p className="text-sm text-muted-foreground">Poisson + Dixon-Coles matrica · P(Over 0.5) = 1 − P(0:0) · kalibracija tržištem</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setOdabrana(null); }} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm" />
          <button onClick={() => ucitaj(true)} disabled={zauzet} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${ucitam ? "animate-spin" : ""}`} /> Učitaj
          </button>
          <button onClick={analizirajPrvih} disabled={zauzet || !filtrirane.length} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
            Auto-analiza prvih 3
          </button>
          <button onClick={() => setSettings(true)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent">⚙️</button>
        </div>
      </div>

      {/* Tabovi 0.5 / 1.5 */}
      <div className="mb-3 inline-flex rounded-xl border border-border bg-card p-1">
        <button onClick={() => setTab("05")} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === "05" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Over 0.5</button>
        <button onClick={() => setTab("15")} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === "15" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Over 1.5</button>
      </div>

      {status && <div className="mb-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">{status}</div>}

      <input value={trazim} onChange={(e) => setTrazim(e.target.value)} placeholder="Traži tim ili ligu…" className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {filtrirane.map((u) => {
            const r = rez[u.id];
            return (
              <button key={u.id} onClick={() => analiziraj(u)} disabled={zauzet}
                className={`w-full rounded-xl border px-3 py-2 text-left transition hover:border-primary/60 disabled:opacity-60 ${odabrana?.id === u.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{u.home} — {u.away}</span>
                  {r && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                </div>
                <div className="text-xs text-muted-foreground">{u.country ? `${u.country} · ` : ""}{u.league} · {vrijeme(u.time)}</div>
                {r && (
                  <div className="mt-1 flex gap-1 text-[10px]">
                    <span className={`rounded border px-1.5 py-0.5 font-semibold ${razinaBoja(r.niski.razina05)}`}>O0.5 {fmtPct(r.niski.o05)}</span>
                    <span className={`rounded border px-1.5 py-0.5 font-semibold ${razinaBoja(r.niski.razina15)}`}>O1.5 {fmtPct(r.niski.o15)}</span>
                  </div>
                )}
              </button>
            );
          })}
          {!filtrirane.length && !ucitam && <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">Učitaj utakmice gumbom gore.</div>}
        </div>

        <div className="space-y-3">
          {odabrana && radim === odabrana.id && <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Računam matricu rezultata…</div>}
          {odabrana && trenutni && <Panel linija={tab} u={odabrana} r={trenutni} kvota05={kvota05} setKvota05={setKvota05} />}
          {!trenutni && radim == null && <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">Odaberi utakmicu s lijeve strane.</div>}
        </div>
      </div>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function Panel({ linija, u, r, kvota05, setKvota05 }: {
  linija: Linija; u: GoalsUtakmica; r: Rezultat; kvota05: string; setKvota05: (s: string) => void;
}) {
  const { analiza: a, niski, bundle } = r;
  const kvotaO15 = bundle.kvote?.["o15"] ?? null;
  const kvotaO05 = Number(kvota05) > 1.01 ? Number(kvota05) : null;

  const tiket15 = kvotaO15 ? ouTiket(niski.o15, kvotaO15) : null;
  const tiket05 = kvotaO05 ? ouTiket(niski.o05, kvotaO05) : null;

  const preciznost = preciznostOcjena({
    knjigaOu: bundle.knjigaOu ?? 0,
    knjigaBtts: bundle.knjigaBtts ?? 0,
    imaFormuDom: !!bundle.formaDom,
    imaFormuGost: !!bundle.formaGost,
    brojKvota: Object.keys(bundle.kvote ?? {}).length,
  });

  function uKorpu(trziste: string, tip: string, p: number, kvota: number) {
    dodajUKorpu({
      id: `nogomet|${u.id}|${trziste}|${tip}`,
      sport: "nogomet",
      utakmica: `${u.home} - ${u.away}`,
      liga: u.league,
      trziste, tip, kvota, vjerojatnost: p,
    });
    zapisiTip({
      sport: "nogomet",
      kartica: "ou-niski",
      utakmica: `${u.home} — ${u.away}`,
      liga: u.league,
      fixtureId: u.id,
      tip: `${tip} @ ${kvota.toFixed(2)}`,
      p,
      kvota,
      provjera: { vrsta: "ou", strana: "over", linija: tip.includes("0.5") ? 0.5 : 1.5 },
    });
  }

  return linija === "05" ? (
    <>
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Target className="h-4 w-4" /> Over 0.5 — cijela utakmica</div>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${razinaBoja(niski.razina05)}`}>{niski.razina05}</span>
        </div>
        <div className="text-3xl font-bold">{fmtPct(niski.o05)}</div>
        <div className="mt-2"><Traka p={niski.o05} label="P(Over 0.5)" boja={niski.o05 >= 0.93 ? "bg-emerald-500" : "bg-amber-500"} /></div>
        {niski.o05 >= 0.93 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Visoka sigurnost — gol bar jedne ekipe je skoro izvjestan
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>P(0:0) <b className="text-foreground">{fmtPct(1 - niski.o05)}</b></span>
          <span>Fer kvota <b className="text-foreground">{niski.o05Fer.toFixed(2)}</b></span>
          <span>λ ukupno <b className="text-foreground">{niski.lambdaUkupno.toFixed(2)}</b></span>
          <span>Under 0.5 <b className="text-foreground">{fmtPct(1 - niski.o05)}</b></span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input value={kvota05} onChange={(e) => setKvota05(e.target.value)} inputMode="decimal" placeholder="Unesi kvotu kladionice (npr. 1.10)" className="w-48 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
          <button onClick={() => kvotaO05 && uKorpu("O/U 0.5", "Over 0.5", niski.o05, kvotaO05)} disabled={!kvotaO05} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
            <ShoppingCart className="h-3 w-3" /> + Korpa
          </button>
        </div>
        {tiket05 && (
          <div className="mt-2 space-y-1 text-xs">
            <Traka p={Math.max(0, tiket05.edge)} label="Edge (EV)" boja={tiket05.edge >= 0.02 ? "bg-emerald-500" : "bg-red-500"} />
            <Traka p={Math.max(0, tiket05.ulogPerc) / 100} label="Kelly ulog" boja="bg-sky-500" />
            <div className="text-[11px] text-muted-foreground">EV {tiket05.edge >= 0 ? "+" : ""}{(tiket05.edge * 100).toFixed(1)}% · ulog {tiket05.ulogPerc.toFixed(2)}% banke (¼ Kelly)</div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-1 text-sm font-semibold">Over 0.5 — 1. poluvrijeme</div>
        <div className="text-2xl font-bold">{fmtPct(niski.o05HT)}</div>
        <div className="mt-1"><Traka p={niski.o05HT} label="P(1H 0.5+)" boja={niski.o05HT >= 0.6 ? "bg-emerald-500" : "bg-slate-500"} /></div>
        <div className="mt-1 text-xs text-muted-foreground">Fer kvota {niski.o05HTFer.toFixed(2)} · model 44% golova u 1. poluvremenu · razina {niski.razina05HT}</div>
        <button onClick={() => uKorpu("O/U 0.5 (1H)", "Over 0.5 HT", niski.o05HT, niski.o05HTFer)} className="mt-2 flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500">
          <ShoppingCart className="h-3 w-3" /> + Korpa (1H, fer kvota)
        </button>
      </div>
      <PreciznostPanel preciznost={preciznost} a={a} bundle={bundle} />
    </>
  ) : (
    <>
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Target className="h-4 w-4" /> Over 1.5 — cijela utakmica</div>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${razinaBoja(niski.razina15)}`}>{niski.razina15}</span>
        </div>
        <div className="text-3xl font-bold">{fmtPct(niski.o15)}</div>
        <div className="mt-2"><Traka p={niski.o15} label="P(Over 1.5)" boja={niski.o15 >= 0.8 ? "bg-emerald-500" : "bg-amber-500"} /></div>
        {niski.o15 >= 0.8 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Statistička sigurnost &gt; 80% — model smatra 1.5 liniju sigurnom
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>Kvota kladionice <b className="text-foreground">{kvotaO15?.toFixed(2) ?? "—"}</b></span>
          <span>Fer kvota <b className="text-foreground">{niski.o15Fer.toFixed(2)}</b></span>
          <span>Under 1.5 <b className="text-foreground">{fmtPct(1 - niski.o15)}</b></span>
          <span>λ ukupno <b className="text-foreground">{niski.lambdaUkupno.toFixed(2)}</b></span>
        </div>
        <button onClick={() => uKorpu("O/U 1.5", "Over 1.5", niski.o15, kvotaO15 ?? niski.o15Fer)} className="mt-3 flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500">
          <ShoppingCart className="h-3 w-3" /> + Korpa
        </button>
        {tiket15 && (
          <div className="mt-2 space-y-1 text-xs">
            <Traka p={Math.max(0, tiket15.edge)} label="Edge (EV)" boja={tiket15.edge >= 0.02 ? "bg-emerald-500" : "bg-red-500"} />
            <Traka p={Math.max(0, tiket15.ulogPerc) / 100} label="Kelly ulog" boja="bg-sky-500" />
            <div className="text-[11px] text-muted-foreground">EV {tiket15.edge >= 0 ? "+" : ""}{(tiket15.edge * 100).toFixed(1)}% · ulog {tiket15.ulogPerc.toFixed(2)}% banke (¼ Kelly)</div>
          </div>
        )}
      </div>
      {bundle.upozorenja?.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle className="h-4 w-4" /> Upozorenja</div>
          <ul className="space-y-1 text-xs text-amber-200/80">{bundle.upozorenja.map((w, i) => <li key={i}>• {w}</li>)}</ul>
        </div>
      )}
      <PreciznostPanel preciznost={preciznost} a={a} bundle={bundle} />
    </>
  );
}

function PreciznostPanel({ preciznost, a, bundle }: { preciznost: ReturnType<typeof preciznostOcjena>; a: GoalsIzlaz; bundle: GoalsBundle }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-purple-400" /> Data Precision Score</div>
      <div className="flex items-center gap-3">
        <div className="text-2xl font-bold">{preciznost.score}<span className="text-sm text-muted-foreground">/100</span></div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${razinaBoja(preciznost.razina)}`}>{preciznost.razina}</span>
      </div>
      <div className="mt-2"><Traka p={preciznost.score / 100} label="Provjereno" boja="bg-purple-500" /></div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        {preciznost.tocke.map((t, i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5">{t}</span>)}
        <span className="rounded bg-muted px-1.5 py-0.5">λ dom {a.lambdaDom.toFixed(2)}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">λ gost {a.lambdaGost.toFixed(2)}</span>
        {bundle.bookmaker && <span className="rounded bg-muted px-1.5 py-0.5">Kvote: {bundle.bookmaker}</span>}
      </div>
    </div>
  );
}

