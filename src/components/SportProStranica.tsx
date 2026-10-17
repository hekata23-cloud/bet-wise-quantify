
/* ============================================================
   Zajednička stranica za Košarka Pro i Rukomet Pro.
   - učita utakmice dana (1 API poziv, keš 10 min)
   - analiza po utakmici: forme + kvote → motor → KONKRETAN TIP
     za 1X2, ukupni zbroj, zbroj domaćina i zbroj gosta
   - "Analiziraj prvih N" radi redom i STANE čim osigurač javi limit
   - rezultati se pamte po danu (ponovno otvaranje = 0 poziva)
   ============================================================ */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Brain, CheckCircle2, RefreshCw, Sparkles, Target } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import {
  dohvatiSportUtakmiceServer,
  analizirajSportUtakmicuServer,
  type SportUtakmica,
  type SportIzlaz,
} from "@/lib/sportovi.functions";
import { type SportTipTrzista } from "@/lib/sportovi-motor";
import { zapisiTip, type Provjera } from "@/lib/dnevnik";
import { getApiKey, zagrebDay } from "@/lib/zlatni-guard";

type Sport = "kosarka" | "rukomet";
type Rezultat = { analiza: SportIzlaz };

const MAX_AUTO = 5;

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
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.analiza.tipovi.map((t) => (
                      <span key={t.trziste} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.vrijednost ? "bg-emerald-500/20 text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {t.label}
                      </span>
                    ))}
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

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function Analiza({ u, r, sport }: { u: SportUtakmica; r: Rezultat; sport: Sport }) {
  const a = r.analiza;
  const jed = sport === "kosarka" ? "poena" : "golova";
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{u.domacinNaziv} — {u.gostNaziv}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ocjenaBoja(a.ocjena)}`}>{a.ocjena} · {a.povjerenje}/100</span>
        </div>
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
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary"><Target className="h-4 w-4" /> NAJJAČI TIP (vrijednost)</div>
          <div className="text-lg font-bold text-foreground">{a.tip.label}{a.tip.kvota ? ` @ ${a.tip.kvota.toFixed(2)}` : ""}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Vjerojatnost {fmtPct(a.tip.p)} · edge {(a.tip.edge * 100).toFixed(1)}% · ulog ¼ Kelly {a.tip.kellyPct.toFixed(1)}% banke
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {a.tipovi.map((t) => (
          <div key={t.trziste} className={`rounded-xl border p-3 ${t.vrijednost ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.naslov}</div>
            <div className="mt-0.5 text-base font-bold text-foreground">
              {t.label === "Pobjeda domaćina" ? `1 · ${u.domacinNaziv}` : t.label === "Pobjeda gosta" ? `2 · ${u.gostNaziv}` : t.label}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 text-xs text-muted-foreground">
              <span>Vjerojatnost <b className="text-foreground">{fmtPct(t.p)}</b></span>
              <span>Kvota <b className="text-foreground">{t.kvota?.toFixed(2) ?? "—"}</b></span>
              <span>Fer kvota <b className="text-foreground">{t.fer.toFixed(2)}</b></span>
              <span>Edge <b className={t.edge != null && t.edge >= 0.02 ? "text-emerald-400" : "text-foreground"}>{t.edge != null ? `${(t.edge * 100).toFixed(1)}%` : "—"}</b></span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t.izvor === "model" && t.kvota == null ? "Linija modela (kladionice nisu objavile tržište)" : t.vrijednost ? "Vrijednost u kvoti ✓" : "Najvjerojatniji ishod — bez vrijednosti u kvoti"}
            </div>
          </div>
        ))}
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
