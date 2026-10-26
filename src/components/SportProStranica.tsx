/* ============================================================
   Zajednička stranica za Košarka Pro i Rukomet Pro.
   - učita utakmice dana (1 API poziv, keš 10 min)
   - analiza po utakmici: forme + kvote → motor → KONKRETAN TIP
   - proširena tržišta: Spread/Handicap, četvrtine/poluvremena,
     tempo (pace), ratingi napada/obrane
   - svaki tip ide jednim klikom u Korpu (frakcijski Kelly tiket)
   - rezultati se pamte po danu (ponovno otvaranje = 0 poziva)
   ============================================================ */
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, BarChart3, Brain, CheckCircle2, Gauge, Plus,
  RefreshCw, Scale, ShoppingCart, Sparkles, Target,
} from "lucide-react";
import { SportSettingsModal } from "@/components/SportSettingsModal";
import {
  dohvatiSportUtakmiceServer,
  analizirajSportUtakmicuServer,
  type SportUtakmica,
  type SportIzlaz,
} from "@/lib/sportovi.functions";
import { type SportTipTrzista } from "@/lib/sportovi-motor";
import {
  handicapRedovi, raspadPeriodi, tempoIndeks, timRatingi, ratingLabel,
  type SportDod,
} from "@/lib/sport-dodatci";
import { dodajUKorpu } from "@/lib/korpa";
import { zapisiTip, type Provjera } from "@/lib/dnevnik";
import { getApiKey, zagrebDay } from "@/lib/zlatni-guard";

type Sport = "kosarka" | "rukomet";
type Rezultat = { analiza: SportIzlaz };

const MAX_AUTO = 3; // max 3 = max 6 API poziva (ispod limita 10/min)

function fmtPct(x: number) { return `${(x * 100).toFixed(1)}%`; }
function vrijeme(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function ocjenaBoja(o: string) {
  if (o === "A+") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (o === "A") return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  if (o === "B+") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-slate-500/20 text-slate-300 border-slate-500/40";
}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
const jeZastita = (e: string | null | undefined) => !!e && /DNEVNI_LIMIT|ACCOUNT|RATE_LIMIT/.test(e);

function provjeraZa(sport: Sport, t: SportTipTrzista): Provjera | null {
  const strana = t.kljuc;
  if (t.trziste === "1x2") {
    if (strana !== "1" && strana !== "X" && strana !== "2") return null;
    if (sport === "rukomet" || strana === "X") return { vrsta: "1x2reg", strana };
    return { vrsta: "1x2", strana };
  }
  if ((strana !== "over" && strana !== "under") || t.linija == null) return null;
  if (t.trziste === "ukupno") return { vrsta: "ou", strana, linija: t.linija };
  return { vrsta: "tt", tim: t.trziste, strana, linija: t.linija };
}

/** Progress bar — vizualni prikaz vjerojatnosti / edge-a / povjerenja. */
function UlogBar({ p, boja = "bg-emerald-500", label }: { p: number; boja?: string; label?: string }) {
  const w = Math.max(0, Math.min(100, p * 100));
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{label}</span>}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${boja}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-foreground">{w.toFixed(1)}%</span>
    </div>
  );
}

export function SportProStranica(props: {
  sport: Sport;
  naslov: string;
  podnaslov: string;
  ikona: ReactNode;
  kartica: string;
}) {
  const { sport, kartica } = props;
  const pre = sport === "kosarka" ? "kos.pro" : "ruko.pro";
  const [date, setDate] = useState(zagrebDay());
  const [utakmice, setUtakmice] = useState<SportUtakmica[]>([]);
  const [status, setStatus] = useState("");
  const [ucitam, setUcitam] = useState(false);
  const [trazim, setTrazim] = useState("");
  const [odabrana, setOdabrana] = useState<SportUtakmica | null>(null);
  const [radim, setRadim] = useState<number | null>(null);
  const [rez, setRez] = useState<Record<number, Rezultat>>({});
  const [settings, setSettings] = useState(false);

  const rezKljuc = (dan: string) => `${pre}.rez.v4.${dan}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(rezKljuc(date));
      setRez(raw ? (JSON.parse(raw) as Record<number, Rezultat>) : {});
      const fix = localStorage.getItem(`${pre}.fix.v3.${date}`);
      if (fix) {
        const f = JSON.parse(fix) as { t: number; utakmice: SportUtakmica[] };
        setUtakmice(f.utakmice);
      } else setUtakmice([]);
    } catch { setRez({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const spremiRez = (dan: string, novi: Record<number, Rezultat>) => {
    try { localStorage.setItem(rezKljuc(dan), JSON.stringify(novi)); } catch { /* ignoriraj */ }
  };

  const ucitaj = async (force = false) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatus(`Prvo unesi API-Sports ključ u Postavkama (⚙️).`);
      setSettings(true);
      return;
    }
    const ck = `${pre}.fix.v3.${date}`;
    if (!force) {
      try {
        const kes = localStorage.getItem(ck);
        if (kes) {
          const f = JSON.parse(kes) as { t: number; utakmice: SportUtakmica[] };
          if (Date.now() - f.t < 10 * 60_000) { setUtakmice(f.utakmice); setStatus(`Učitano ${f.utakmice.length} utakmica (iz memorije).`); return; }
        }
      } catch { /* ignoriraj */ }
    }
    setUcitam(true);
    setStatus(`Učitavam utakmice za ${date}…`);
    try {
      const r = await withTimeout(dohvatiSportUtakmiceServer({ data: { sport, date, apiKey } }), 30_000);
      if (!r.ok && r.error) {
        setStatus(`Učitavanje nije uspjelo: ${r.error}`);
      } else {
        setUtakmice(r.utakmice);
        localStorage.setItem(ck, JSON.stringify({ t: Date.now(), utakmice: r.utakmice }));
        setStatus(
          r.utakmice.length
            ? `Učitano ${r.utakmice.length} utakmica. Klikni utakmicu ili "Analiziraj prvih ${MAX_AUTO}".`
            : "Nema nadolazećih utakmica za taj dan.",
        );
      }
    } catch {
      setStatus("Server nije odgovorio na vrijeme — probaj ponovno za minutu.");
    }
    setUcitam(false);
  };

  const analiziraj = async (u: SportUtakmica, tiho = false): Promise<string | null> => {
    const apiKey = getApiKey();
    if (!apiKey) { setSettings(true); return "ACCOUNT: nema ključa"; }
    setOdabrana(u);
    if (rez[u.id]) return null;
    setRadim(u.id);
    if (!tiho) setStatus(`Analiziram ${u.domacinNaziv} — ${u.gostNaziv}…`);
    try {
      const res = await withTimeout(analizirajSportUtakmicuServer({ data: { sport, utakmica: u, apiKey } }), 60_000);
      if (!res.ok || !res.izlaz) {
        const err = res.error || "Greška pri analizi";
        setStatus(`⚠️ ${err}`);
        setRadim(null);
        return jeZastita(err) ? err : null;
      }
      const a = res.izlaz;
      setRez((prev) => {
        const novi = { ...prev, [u.id]: { analiza: a } };
        spremiRez(date, novi);
        return novi;
      });

      for (const t of a.tipovi) {
        const pr = provjeraZa(sport, t);
        if (!pr) continue;
        zapisiTip({
          sport,
          kartica,
          utakmica: `${u.domacinNaziv} — ${u.gostNaziv}`,
          liga: u.ligaNaziv,
          fixtureId: u.id,
          tip: t.kvota != null ? `${t.label} @ ${t.kvota.toFixed(2)}` : t.label,
          p: t.p,
          kvota: t.kvota,
          provjera: pr,
        });
      }
      if (!tiho) setStatus(`Gotovo — povjerenje ${a.povjerenje}/100 (${a.ocjena}). Tipovi su zapisani u Dnevnik.`);
      setRadim(null);
      return null;
    } catch {
      setStatus("Dohvat nije uspio (server zauzet) — probaj ponovno za minutu.");
      setRadim(null);
      return null;
    }
  };

  const filtrirane = utakmice.filter(
    (u) => !trazim || `${u.domacinNaziv} ${u.gostNaziv} ${u.ligaNaziv} ${u.ligaZemlja}`.toLowerCase().includes(trazim.toLowerCase()),
  );

  const analizirajSve = async () => {
    const lista = filtrirane.filter((u) => !rez[u.id]).slice(0, MAX_AUTO);
    if (!lista.length) { setStatus("Sve prikazane utakmice su već analizirane."); return; }
    for (let i = 0; i < lista.length; i++) {
      const u = lista[i]!;
      setStatus(`Analiziram ${i + 1}/${lista.length}: ${u.domacinNaziv} — ${u.gostNaziv}…`);
      const zast = await analiziraj(u, true);
      if (zast) { setStatus(`Zaustavljeno radi zaštite računa: ${zast}`); return; }
    }
    setStatus(`Gotovo — analizirano ${lista.length} utakmica. Tipovi su zapisani u Dnevnik.`);
  };

  const trenutni = odabrana ? rez[odabrana.id] : undefined;
  const zauzet = radim != null || ucitam;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">{props.ikona} {props.naslov}</h1>
          <p className="text-sm text-muted-foreground">{props.podnaslov}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setOdabrana(null); }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          />
          <button
            onClick={() => ucitaj(true)}
            disabled={zauzet}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${ucitam ? "animate-spin" : ""}`} /> Učitaj
          </button>
          <button
            onClick={analizirajSve}
            disabled={zauzet || !filtrirane.length}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> Analiziraj prvih {MAX_AUTO}
          </button>
          <button onClick={() => setSettings(true)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent">⚙️</button>
        </div>
      </div>

      {status && <div className="mb-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">{status}</div>}

      <input
        value={trazim}
        onChange={(e) => setTrazim(e.target.value)}
        placeholder="Traži tim ili ligu…"
        className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {filtrirane.map((u) => {
            const r = rez[u.id];
            return (
              <button
                key={u.id}
                onClick={() => analiziraj(u)}
                disabled={zauzet}
                className={`w-full rounded-xl border px-3 py-2 text-left transition hover:border-primary/60 disabled:opacity-60 ${
                  odabrana?.id === u.id ? "border-primary bg-primary/10" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{u.domacinNaziv} — {u.gostNaziv}</span>
                  {radim === u.id && <Brain className="h-4 w-4 animate-pulse text-primary" />}
                  {r && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                </div>
                <div className="text-xs text-muted-foreground">{u.ligaZemlja ? `${u.ligaZemlja} · ` : ""}{u.ligaNaziv} · {vrijeme(u.datumIso)}</div>
                {r && (
                  <div className="mt-1.5">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${r.analiza.povjerenje >= 70 ? "bg-emerald-500" : r.analiza.povjerenje >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${r.analiza.povjerenje}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.analiza.tipovi.map((t) => (
                        <span key={t.trziste} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.vrijednost ? "bg-emerald-500/20 text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
          {!filtrirane.length && !ucitam && (
            <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">Učitaj utakmice gumbom gore.</div>
          )}
        </div>

        <div className="space-y-3">
          {odabrana && radim === odabrana.id && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Brain className="h-4 w-4 animate-pulse text-primary" /> Dohvaćam forme i kvote…
            </div>
          )}

          {odabrana && trenutni && <Analiza u={odabrana} r={trenutni} sport={sport} />}

          {!trenutni && radim == null && (
            <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">Odaberi utakmicu s lijeve strane.</div>
          )}
        </div>
      </div>

      <SportSettingsModal open={settings} onClose={() => setSettings(false)} sport={sport} />
    </div>
  );
}

/** Dodavanje tipa u Korpu (Bet Slip). */
function ubaciUKorpu(sport: Sport, u: SportUtakmica, trziste: string, tip: string, kvota: number, p: number) {
  dodajUKorpu({
    id: `${sport}|${u.id}|${trziste}|${tip}`,
    sport: sport === "kosarka" ? "košarka" : "rukomet",
    utakmica: `${u.domacinNaziv} - ${u.gostNaziv}`,
    liga: u.ligaNaziv,
    trziste,
    tip,
    kvota,
    vjerojatnost: p,
    fixtureId: u.id,
  });
}

function Analiza({ u, r, sport }: { u: SportUtakmica; r: Rezultat; sport: Sport }) {
  const a = r.analiza;
  const jed = sport === "kosarka" ? "poena" : "golova";
  const dod: SportDod = sport;

  const handi = handicapRedovi(dod, a.lambdaDom, a.lambdaGost);
  const rasp = raspadPeriodi(dod, a.ukupnoOcekivano, a.sigmaUkupno);
  const tempo = tempoIndeks(dod, a.ukupnoOcekivano);
  const ratingi = timRatingi(dod, a.lambdaDom, a.lambdaGost);
  const handicapNaziv = sport === "kosarka" ? "Spread / Handicap" : "Azijski handicap";
  const raspadNaziv = sport === "kosarka" ? "Raspad po četvrtinama" : "Golovi po poluvremenima";

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{u.domacinNaziv} — {u.gostNaziv}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ocjenaBoja(a.ocjena)}`}>{a.ocjena} · {a.povjerenje}/100</span>
        </div>
        <div className="mb-2"><UlogBar p={a.povjerenje / 100} label="Povjerenje" boja={a.povjerenje >= 70 ? "bg-emerald-500" : a.povjerenje >= 50 ? "bg-amber-500" : "bg-red-500"} /></div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/40 p-2"><div className="text-muted-foreground">Domaćin</div><div className="text-lg font-bold text-foreground">{a.lambdaDom.toFixed(1)}</div></div>
          <div className="rounded-lg bg-muted/40 p-2"><div className="text-muted-foreground">Ukupno</div><div className="text-lg font-bold text-foreground">{a.ukupnoOcekivano.toFixed(1)}</div></div>
          <div className="rounded-lg bg-muted/40 p-2"><div className="text-muted-foreground">Gost</div><div className="text-lg font-bold text-foreground">{a.lambdaGost.toFixed(1)}</div></div>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Očekivani {jed}{sport === "kosarka" ? " (uklj. produžetke)" : ""}{a.bookmaker ? ` · kvote (npr. ${a.bookmaker})` : ""}
        </div>
      </div>

      {a.tip && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Target className="h-4 w-4" /> NAJJAČI TIP (vrijednost)</div>
            <button
              onClick={() => ubaciUKorpu(sport, u, "Glavni tip", a.tip!.label, a.tip!.kvota ?? 1 / Math.max(0.02, a.tip!.p), a.tip!.p)}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
            >
              <ShoppingCart className="h-3 w-3" /> + Korpa
            </button>
          </div>
          <div className="text-lg font-bold text-foreground">{a.tip.label}{a.tip.kvota ? ` @ ${a.tip.kvota.toFixed(2)}` : ""}</div>
          <div className="mt-2 space-y-1.5">
            <UlogBar p={a.tip.p} label="Vjerojatnost" />
            <UlogBar p={Math.max(0, a.tip.edge)} label="Edge" boja={a.tip.edge >= 0.02 ? "bg-emerald-500" : "bg-amber-500"} />
            <UlogBar p={Math.max(0, a.tip.kellyPct) / 100} label="¼ Kelly" boja="bg-sky-500" />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            EV {a.tip.ev >= 0 ? "+" : ""}{(a.tip.ev * 100).toFixed(1)}% · preporučeni ulog {a.tip.kellyPct.toFixed(1)}% banke
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {a.tipovi.map((t) => (
          <div key={t.trziste} className={`rounded-xl border p-3 ${t.vrijednost ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.naslov}</div>
              <button
                onClick={() => ubaciUKorpu(sport, u, t.naslov, t.label, t.kvota ?? t.fer, t.p)}
                title="Dodaj u Korpu"
                className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-0.5 text-base font-bold text-foreground">
              {t.label === "Pobjeda domaćina" ? `1 · ${u.domacinNaziv}` : t.label === "Pobjeda gosta" ? `2 · ${u.gostNaziv}` : t.label}
            </div>
            <div className="mt-1.5 space-y-1">
              <UlogBar p={t.p} label="Vjerojatnost" />
              {t.edge != null && <UlogBar p={Math.max(0, t.edge)} label="Edge" boja={t.edge >= 0.02 ? "bg-emerald-500" : "bg-amber-500"} />}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 text-xs text-muted-foreground">
              <span>Kvota <b className="text-foreground">{t.kvota?.toFixed(2) ?? "—"}</b></span>
              <span>Fer kvota <b className="text-foreground">{t.fer.toFixed(2)}</b></span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t.izvor === "model" && t.kvota == null ? "Linija modela (kladionice nisu objavile tržište)" : t.vrijednost ? "Vrijednost u kvoti ✓" : "Najvjerojatniji ishod — bez vrijednosti u kvoti"}
            </div>
          </div>
        ))}
      </div>

      {/* Prošireno tržište: Spread / Azijski handicap */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Scale className="h-4 w-4 text-sky-400" /> {handicapNaziv}</div>
        <div className="space-y-1">
          {handi.map((h) => (
            <div key={h.linija} className="grid grid-cols-[64px_1fr_1fr] items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5 text-xs">
              <span className="font-mono font-bold text-foreground">{h.linija > 0 ? `+${h.linija}` : h.linija}</span>
              <button
                onClick={() => ubaciUKorpu(sport, u, handicapNaziv, `${u.domacinNaziv} ${h.linija > 0 ? `+${h.linija}` : h.linija}`, h.ferDom, h.pDom)}
                className={`rounded-md border px-2 py-1 text-left transition hover:brightness-125 ${h.najbolji === "dom" ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/40"}`}
              >
                <span className="block truncate font-medium text-foreground">{u.domacinNaziv}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{fmtPct(h.pDom)} · fer {h.ferDom.toFixed(2)}</span>
              </button>
              <button
                onClick={() => ubaciUKorpu(sport, u, handicapNaziv, `${u.gostNaziv} ${-h.linija > 0 ? `+${-h.linija}` : -h.linija}`, h.ferGost, h.pGost)}
                className={`rounded-md border px-2 py-1 text-left transition hover:brightness-125 ${h.najbolji === "gost" ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/40"}`}
              >
                <span className="block truncate font-medium text-foreground">{u.gostNaziv}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{fmtPct(h.pGost)} · fer {h.ferGost.toFixed(2)}</span>
              </button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Model linija (fer kvote) — kladionice često kasne s ovim tržištima. Klik dodaje tip u Korpu.</p>
      </div>

      {/* Prošireno tržište: raspad po periodima */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-amber-400" /> {raspadNaziv}</div>
        <div className="space-y-1.5">
          {rasp.map((rr) => (
            <div key={rr.label} className="rounded-lg bg-muted/30 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-foreground">{rr.label}</span>
                <span className="text-muted-foreground">
                  očekivano <b className="text-foreground">{rr.ocekivano.toFixed(1)}</b> {jed} · linija <b className="text-foreground">{rr.linija}</b>
                </span>
                <button
                  onClick={() => ubaciUKorpu(sport, u, raspadNaziv, `${rr.label} Over ${rr.linija}`, 1 / Math.max(0.02, rr.pOver), rr.pOver)}
                  className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:brightness-125"
                >
                  Over <ShoppingCart className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-1"><UlogBar p={rr.pOver} label={`P(Over)`} boja={rr.pOver >= 0.55 ? "bg-emerald-500" : "bg-sky-500"} /></div>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Težine perioda: {sport === "kosarka" ? "Q1 24.5% · Q2 25.5% · Q3 24.5% · Q4 25.5%" : "1. pol. 48% · 2. pol. 52%"} — varijanca se točno sabira u ukupnu.
        </p>
      </div>

      {/* Tempo i ratingi */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Gauge className="h-4 w-4 text-purple-400" /> Tempo & ratingi (1.00 = prosjek lige)</div>
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 font-medium text-foreground">{tempo.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(100, (tempo.indeks / 1.2) * 100)}%` }} />
          </div>
          <span className="font-mono text-[10px] text-foreground">{tempo.indeks.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/30 px-2 py-1.5">
            <div className="truncate font-medium text-foreground">{u.domacinNaziv}</div>
            <div className="text-[10px] text-muted-foreground">Napad {ratingi.napadDom.toFixed(2)} · {ratingLabel(ratingi.napadDom, false)}</div>
            <div className="text-[10px] text-muted-foreground">Obrana {ratingi.obranaDom.toFixed(2)} · {ratingLabel(ratingi.obranaDom, true)}</div>
          </div>
          <div className="rounded-lg bg-muted/30 px-2 py-1.5">
            <div className="truncate font-medium text-foreground">{u.gostNaziv}</div>
            <div className="text-[10px] text-muted-foreground">Napad {ratingi.napadGost.toFixed(2)} · {ratingLabel(ratingi.napadGost, false)}</div>
            <div className="text-[10px] text-muted-foreground">Obrana {ratingi.obranaGost.toFixed(2)} · {ratingLabel(ratingi.obranaGost, true)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <div className="mb-1 font-semibold text-foreground">Sve vjerojatnosti</div>
        <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
          {["1", "X", "2"].map((k) =>
            a.final[k] != null ? (
              <span key={k}>{k === "X" && sport === "kosarka" ? "X (4 čet.)" : k}: <b className="text-foreground">{fmtPct(a.final[k]!)}</b></span>
            ) : null,
          )}
        </div>
      </div>

      {a.faktori.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 text-sm font-semibold text-foreground">Što je model vidio</div>
          <ul className="space-y-1 text-xs text-muted-foreground">{a.faktori.map((f, i) => <li key={i}>• {f}</li>)}</ul>
        </div>
      )}
      {a.upozorenja.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle className="h-4 w-4" /> Upozorenja</div>
          <ul className="space-y-1 text-xs text-amber-200/80">{a.upozorenja.map((f, i) => <li key={i}>• {f}</li>)}</ul>
        </div>
      )}
    </>
  );
}


