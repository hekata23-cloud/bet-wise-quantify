/* ============================================================
   BTTS ULTRA — "Oba tima daju gol" pod lupom
   Motor: goals-motor.ts (Poisson + Dixon-Coles + kalibracija tržištem)
   Podaci: goals.functions.ts (kroz api-guard, limiti Football API-ja
   ne mogu biti oboreni ovom karticom)
   v5: motor UVIJEK radi — i kad bundle ima grešku (limit/ključ/minute)
   i kad nema kvota; 90 s timeout po pokušaju + automatski drugi pokušaj;
   panel KONKRETAN TIP — jedna strana, kvota, EV, 1/4 Kelly ulog,
   sigurnosna linija i protivtip, sve iz same matrice.
   ============================================================ */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Flame,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { SettingsModal } from "../components/SettingsModal";
import { getGoalsBundle, getGoalsUtakmice, type GoalsBundle, type GoalsUtakmica } from "../lib/goals.functions";
import { goalsAnaliza, type GoalsIzlaz } from "../lib/goals-motor";
import { getApiKey, zagrebDay } from "../lib/zlatni-guard";
import { zapisiTip } from "../lib/dnevnik";
import { MatchInsightPanel } from "../components/MatchInsightPanel";

export const Route = createFileRoute("/btts-ultra")({
  head: () => ({
    meta: [{ title: "BTTS Ultra · Oba tima daju gol · Precision Check" }],
  }),
  component: BttsUltraPage,
});

function fmtPct(x: number) { return `${(x * 100).toFixed(1)}%`; }
function vremeno(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function edgeBoja(e: number) {
  if (e >= 0.05) return "text-emerald-400";
  if (e >= 0.02) return "text-amber-400";
  return "text-slate-500";
}
function ocjenaBoja(o: string) {
  if (o === "A+") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (o === "A") return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  if (o === "B+") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-slate-500/20 text-slate-300 border-slate-500/40";
}
/** Timeout: nikad ne vrti spinner beskonačno na zauzetom API-ju. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`premašio ${ms / 1000} s`)), ms)),
  ]);
}
/** 1/4 Kelly u % banke, ograničeno na 3%. */
function kellyUlog(p: number, kvota: number) {
  if (kvota <= 1 || p <= 0) return 0;
  return Math.max(0, Math.min(3, ((p * kvota - 1) / (kvota - 1)) * 25));
}

interface TipStrana { label: string; p: number | null; kv: number | null | undefined }

function BttsUltraPage() {
  const [date, setDate] = useState(zagrebDay());
  const [utakmice, setUtakmice] = useState<GoalsUtakmica[]>([]);
  const [status, setStatus] = useState("");
  const [ucitam, setUcitam] = useState(false);
  const [trazim, setTrazim] = useState("");
  const [odabrana, setOdabrana] = useState<GoalsUtakmica | null>(null);
  const [analiziram, setAnaliziram] = useState(false);
  const [bundle, setBundle] = useState<GoalsBundle | null>(null);
  const [analiza, setAnaliza] = useState<GoalsIzlaz | null>(null);
  const [settings, setSettings] = useState(false);

  const ucitaj = async (dan: string, force = false) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatus("Prvo unesi API-Football ključ u Postavkama (⚙️).");
      setSettings(true);
      return;
    }
    setUcitam(true);
    setStatus("Učitavam utakmice za " + dan + "…");
    const ck = `bttsu.fix.${dan}`;
    try {
      const kes = force ? null : localStorage.getItem(ck);
      const r = kes ? (JSON.parse(kes) as { error: string | null; utakmice: GoalsUtakmica[] })
        : await getGoalsUtakmice({ data: { date: dan, apiKey } });
      if (!force && !kes) localStorage.setItem(ck, JSON.stringify(r));
      if (r.error) {
        setUtakmice([]);
        setStatus(`Učitavanje nije uspjelo: ${r.error}`);
      } else {
        setUtakmice(r.utakmice);
        setStatus(r.utakmice.length
          ? `Učitano ${r.utakmice.length} utakmica. Klikni utakmicu za BTTS analizu.`
          : "Nema nadolazećih utakmica za taj dan.");
      }
    } catch {
      setStatus("Greška pri dohvatu utakmica.");
    }
    setUcitam(false);
  };

  const analiziraj = async (u: GoalsUtakmica) => {
    const apiKey = getApiKey();
    if (!apiKey) { setStatus("Nedostaje API ključ."); setSettings(true); return; }
    setOdabrana(u);
    setAnaliziram(true);
    setBundle(null);
    setAnaliza(null);
    setStatus(`Analiziram ${u.home} — ${u.away}…`);
    const ck = `bttsu.bundle.v5.${u.id}`;

    // v5: 90 s po pokušaju + jedan automatski ponovni pokušaj —
    // red API-ja (10 poziva/min) zna trajati dulje od 45 s.
    const dohvati = async (): Promise<GoalsBundle> =>
      (await withTimeout(
        getGoalsBundle({ data: { id: u.id, homeId: u.homeId, awayId: u.awayId, apiKey } }),
        90_000,
      )) as GoalsBundle;

    try {
      const kes = localStorage.getItem(ck);
      let b: GoalsBundle;
      if (kes) {
        b = JSON.parse(kes) as GoalsBundle;
      } else {
        try {
          setStatus("Dohvaćam kvote i forme (API red, do 90 s)…");
          b = await dohvati();
        } catch {
          setStatus("Prvi pokušaj nije došao do kraja — pokušavam još jednom…");
          b = await dohvati();
        }
      }
      // Ne pamti greške u keš — samo uspješne bundleve.
      if (!kes && !b.error) localStorage.setItem(ck, JSON.stringify(b));
      setBundle(b);

      // Motor UVIJEK radi — i kad bundle ima grešku i kad nema kvota.
      try {
        const a = goalsAnaliza({
          kvote: b.kvote ?? {},
          formaDom: b.formaDom,
          formaGost: b.formaGost,
          brojKladionica: b.knjigaBtts + b.knjigaOu,
        });
        setAnaliza(a);
        // Dnevnik: zapiši konkretnu stranu BTTS da Dnevnik može ocijeniti karticu.
        const stranaD: "da" | "ne" =
          (a.final["bttsDa"] ?? 0) >= (a.final["bttsNe"] ?? 0) ? "da" : "ne";
        const pTipD = stranaD === "da" ? a.final["bttsDa"] : a.final["bttsNe"];
        const kvTipD = b.kvote?.[stranaD === "da" ? "bttsDa" : "bttsNe"];
        if (pTipD != null) {
          zapisiTip({
            kartica: "BTTS Ultra",
            utakmica: `${u.home} — ${u.away}`,
            liga: u.league,
            fixtureId: u.id,
            tip: kvTipD != null ? `BTTS ${stranaD.toUpperCase()} @ ${kvTipD.toFixed(2)}` : `BTTS ${stranaD.toUpperCase()}`,
            p: pTipD,
            kvota: kvTipD ?? null,
            provjera: { vrsta: "btts", strana: stranaD },
          });
        }
        if (b.error)
          setStatus(`⚠️ ${b.error} — ispod je analiza s podacima koji postoje (motor radi i bez kvota).`);
        else
          setStatus(`Gotovo — povjerenje ${a.povjerenje}/100 (${a.ocjena}).`);
      } catch {
        setStatus("Motor nije uspio izračunati analizu za ovu utakmicu — probaj Refresh pa opet.");
      }
    } catch {
      setStatus("Dohvat podataka nije uspio ni drugim pokušajem — API je zaokupljen, probaj za minutu.");
    }
    setAnaliziram(false);
  };

  const filtrirane = utakmice.filter((u) =>
    !trazim || `${u.home} ${u.away} ${u.league} ${u.country}`.toLowerCase().includes(trazim.toLowerCase()),
  );

  const pDa = analiza?.final["bttsDa"] ?? null;
  const pNe = analiza?.final["bttsNe"] ?? null;
  const kvotaDa = bundle?.kvote?.["bttsDa"];
  const kvotaNe = bundle?.kvote?.["bttsNe"];
  const preporukaDa = pDa != null && kvotaDa != null && (pDa * kvotaDa - 1) >= 0.02;
  const preporukaNe = pNe != null && kvotaNe != null && (pNe * kvotaNe - 1) >= 0.02;

  // ── KONKRETAN TIP: jedna strana BTTS + kvota + EV + Kelly ulog + sigurnosna linija ──
  let tip: null | {
    label: string; p: number; kv: number | null; edge: number | null; ulog: number;
    sigLabel: string; sigP: number | null; sigKv: number | null;
    altLabel: string; altP: number | null;
  } = null;
  if (analiza) {
    const strane: TipStrana[] = [
      { label: "DA", p: pDa, kv: kvotaDa },
      { label: "NE", p: pNe, kv: kvotaNe },
    ];
    const isplativi = strane.filter((s) => s.p != null && s.kv != null && s.p * s.kv - 1 > 0)
      .sort((a, b) => b.p! * b.kv! - a.p! * a.kv!);
    const poProb = strane.filter((s) => s.p != null).sort((a, b) => b.p! - a.p!);
    const c = isplativi[0] ?? poProb[0]!;
    const sig = c.label === "DA"
      ? { label: "Više od 1.5 golova", p: analiza.final["o15"] ?? null, kv: bundle?.kvote?.["o15"] ?? null }
      : { label: "Manje od 2.5 golova", p: analiza.final["u25"] ?? null, kv: bundle?.kvote?.["u25"] ?? null };
    tip = {
      label: c.label,
      p: c.p!,
      kv: c.kv ?? null,
      edge: c.p != null && c.kv != null ? c.p * c.kv - 1 : null,
      ulog: c.kv != null ? kellyUlog(c.p!, c.kv) : 0,
      sigLabel: sig.label,
      sigP: sig.p,
      sigKv: sig.kv,
      altLabel: c.label === "DA" ? "NE" : "DA",
      altP: strane.find((s) => s.label !== c.label)?.p ?? null,
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Flame className="h-5 w-5 text-orange-400" /> BTTS Ultra
          </h1>
          <p className="text-xs text-muted-foreground">
            Oba tima daju gol — Poisson + Dixon-Coles matrica, kalibrirana tržištem, s formom oba tima.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => ucitaj(date, true)}
            disabled={ucitam}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {ucitam ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Učitaj
          </button>
        </div>
      </div>

      {status && (
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          {status}
          <button onClick={() => setSettings(true)} className="ml-2 underline hover:text-foreground">Postavke</button>
        </div>
      )}

      {utakmice.length > 0 && (
        <input
          value={trazim}
          onChange={(e) => setTrazim(e.target.value)}
          placeholder="Traži tim ili ligu…"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtrirane.map((u) => (
          <button
            key={u.id}
            onClick={() => analiziraj(u)}
            className={`rounded-xl border p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/50 ${
              odabrana?.id === u.id ? "border-primary/70 bg-muted/60" : "border-border bg-card"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {u.country} · {u.league} · {vremeno(u.time)}
            </div>
            <div className="mt-1 text-sm font-semibold">{u.home} — {u.away}</div>
          </button>
        ))}
      </div>

      {(analiziram || analiza) && odabrana && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{odabrana.home} — {odabrana.away}</h2>
            {analiza && (
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${ocjenaBoja(analiza.ocjena)}`}>
                Povjerenje {analiza.povjerenje}/100 · {analiza.ocjena}
              </span>
            )}
          </div>

          {analiziram && <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Analiziram kroz motor…
          </div>}

          {analiza && (
            <>
              {/* ═══ KONKRETAN TIP ═══ */}
              {tip && (
                <div className="rounded-2xl border border-primary/50 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-primary">🎯 Konkretan tip</div>
                    {tip.kv != null && tip.edge != null && tip.edge >= 0.02 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> ISPLATIVO — ULOG {tip.ulog.toFixed(1)}% BANKE
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                        {tip.kv == null ? "FER TIP — KVOTA JOS NIJE OBJAVLJENA" : "PRESKOČI — NEMA VRIJEDNOSTI"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-black">
                    BTTS {tip.label}
                    {tip.kv != null ? ` @ ${tip.kv.toFixed(2)}` : " (fer kvota dolje)"}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <div className="text-muted-foreground">Vjerojatnost</div>
                      <div className="font-mono font-bold">{fmtPct(tip.p)}</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <div className="text-muted-foreground">Fer kvota</div>
                      <div className="font-mono font-bold">{tip.p > 0 ? (1 / tip.p).toFixed(2) : "—"}</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <div className="text-muted-foreground">Kvota API</div>
                      <div className="font-mono font-bold">{tip.kv?.toFixed(2) ?? "—"}</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <div className="text-muted-foreground">Edge / EV</div>
                      <div className={`font-mono font-bold ${tip.edge != null ? edgeBoja(tip.edge) : ""}`}>
                        {tip.edge != null ? `${(tip.edge * 100).toFixed(1)}%` : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2 text-center">
                      <div className="text-muted-foreground">Protivtip</div>
                      <div className="font-mono font-bold">
                        {tip.altLabel}{tip.altP != null ? ` ${fmtPct(tip.altP)}` : ""}
                      </div>
                    </div>
                  </div>
                  {tip.sigP != null && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      🛡️ Sigurnosna linija: <b className="text-foreground">{tip.sigLabel}</b> (model {fmtPct(tip.sigP)}{tip.sigKv != null ? ` @ ${tip.sigKv.toFixed(2)}` : ""}) — ako ti je glavni tip pretežak, tu ide manji ulog.
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    Odabir: najveći edge među isplativim stranama; ako nijedna nema edge, strana s većom vjerojatnošću.
                  </div>
                </div>
              )}

              {/* Glavni BTTS ishod */}
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { k: "DA", p: pDa, kvota: kvotaDa, rec: preporukaDa },
                  { k: "NE", p: pNe, kvota: kvotaNe, rec: preporukaNe },
                ].map((s) => (
                  <div key={s.k} className="rounded-xl border border-border bg-background/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-muted-foreground">BTTS {s.k}</span>
                      {s.rec && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> VRIJEDI
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-3xl font-black tabular-nums">{s.p != null ? fmtPct(s.p) : "—"}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Fer kvota</div>
                        <div className="font-mono font-bold">{s.p != null ? (1 / s.p).toFixed(2) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Kvota API</div>
                        <div className="font-mono font-bold">{s.kvota?.toFixed(2) ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Edge</div>
                        <div className={`font-mono font-bold ${s.p != null && s.kvota != null ? edgeBoja(s.p * s.kvota - 1) : ""}`}>
                          {s.p != null && s.kvota != null ? `${((s.p * s.kvota - 1) * 100).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Očekivani golovi + suglasnost */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">λ Domaćin</div>
                  <div className="text-xl font-bold tabular-nums">{analiza.lambdaDom.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">μ Gost</div>
                  <div className="text-xl font-bold tabular-nums">{analiza.lambdaGost.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">Ukupno golova</div>
                  <div className="text-xl font-bold tabular-nums">{analiza.lambdaUkupno.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                    <Brain className="h-3 w-3" /> Suglasnost s tržištem
                  </div>
                  <div className="text-xl font-bold tabular-nums">{fmtPct(analiza.suglasnost)}</div>
                </div>
              </div>

              {/* Kontekst: ostala tržišta iz iste matrice */}
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Kontekst iz iste matrice (istinitost BTTS procjene)
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  {["o25", "u25", "o15", "o35", "nulaNula"].map((k) => {
                    const p = k === "nulaNula"
                      ? analiza.topRezultati.find((t) => t.rezultat === "0:0")?.p ?? null
                      : analiza.final[k];
                    const label: Record<string, string> = { o25: "Over 2.5", u25: "Under 2.5", o15: "Over 1.5", o35: "Over 3.5", nulaNula: "0:0" };
                    return (
                      <div key={k} className="rounded-lg bg-muted/40 p-2 text-center">
                        <div className="text-muted-foreground">{label[k]}</div>
                        <div className="font-mono font-bold">{p != null ? fmtPct(p) : "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Faktori */}
              {analiza.faktori.length > 0 && (
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <ShieldCheck className="h-3 w-3" /> Što model gleda
                  </div>
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {analiza.faktori.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}

              {/* Top rezultati */}
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Najvjerojatniji rezultati</div>
                <div className="flex flex-wrap gap-2">
                  {analiza.topRezultati.map((t) => (
                    <span key={t.rezultat} className="rounded-lg bg-muted/40 px-2 py-1 font-mono text-xs">
                      {t.rezultat} · {fmtPct(t.p)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Upozorenja */}
              {analiza.upozorenja.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
                    <AlertTriangle className="h-3 w-3" /> Upozorenja
                  </div>
                  <ul className="list-inside list-disc text-xs text-amber-200/90">
                    {analiza.upozorenja.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {bundle && bundle.kvote?.["bttsDa"] == null && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                  <XCircle className="h-4 w-4 text-red-400" />
                  Knjige ne nude BTTS tržište za ovu utakmicu — procjena je čisto modelna (fer kvote gore).
                </div>
              )}
              {/* ═══ SARP MATCH INSIGHT PANEL (9 sekcija) ═══ */}
              <MatchInsightPanel
                utakmica={{
                  id: odabrana.id,
                  home: odabrana.home,
                  away: odabrana.away,
                  league: odabrana.league,
                  country: odabrana.country,
                  time: odabrana.time,
                }}
                kvote={bundle?.kvote ?? {}}
                brojKladionica={bundle ? bundle.knjigaBtts + bundle.knjigaOu : 0}
                formaDom={bundle?.formaDom ?? null}
                formaGost={bundle?.formaGost ?? null}
                goals={analiza}
              />
            </>
          )}
        </div>
      )}
      {settings && <SettingsModal open={settings} onClose={() => setSettings(false)} />}
    </div>
  );
}

