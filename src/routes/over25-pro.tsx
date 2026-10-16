/* ============================================================
   2.5 PRO — Over/Under 2.5 (i 1.5 / 3.5 kontekst) pod lupom
   Motor: goals-motor.ts (Poisson + Dixon-Coles + kalibracija tržištem)
   Podaci: goals.functions.ts (kroz api-guard)
   NOVO: panel KONKRETAN TIP — jedna strana 2.5 linije, kvota, EV,
   1/4 Kelly ulog, sigurnosna linija i protivtip, sve iz same matrice.
   ============================================================ */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Gauge,
  RefreshCw,
  Search,
  Target,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { getGoalsBundle, getGoalsUtakmice, type GoalsBundle, type GoalsUtakmica } from "@/lib/goals.functions";
import { goalsAnaliza, type GoalsIzlaz } from "@/lib/goals-motor";
import { getApiKey, zagrebDay } from "@/lib/zlatni-guard";

export const Route = createFileRoute("/over25-pro")({
  head: () => ({
    meta: [{ title: "2.5 Pro · Over/Under 2.5 · Precision Check" }],
  }),
  component: Over25ProPage,
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

function Over25ProPage() {
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
    const ck = `o25p.fix.${dan}`;
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
          ? `Učitano ${r.utakmice.length} utakmica. Klikni utakmicu za Over/Under analizu.`
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
    const ck = `o25p.bundle.${u.id}`;
    try {
      const kes = localStorage.getItem(ck);
      const b = kes ? (JSON.parse(kes) as GoalsBundle)
        : await getGoalsBundle({ data: { id: u.id, homeId: u.homeId, awayId: u.awayId, apiKey } });
      if (!kes) localStorage.setItem(ck, JSON.stringify(b));
      setBundle(b);
      if (b.error) {
        setStatus(`Analiza nije uspjela: ${b.error}`);
      } else {
        const a = goalsAnaliza({ kvote: b.kvote, formaDom: b.formaDom, formaGost: b.formaGost, brojKladionica: b.knjigaOu });
        setAnaliza(a);
        setStatus(`Gotovo — povjerenje ${a.povjerenje}/100 (${a.ocjena}).`);
      }
    } catch {
      setStatus("Greška pri analizi.");
    }
    setAnaliziram(false);
  };

  const filtrirane = utakmice.filter((u) =>
    !trazim || `${u.home} ${u.away} ${u.league} ${u.country}`.toLowerCase().includes(trazim.toLowerCase()),
  );

  const LINIJE = [
    { o: "o25", u: "u25", ime: "Over/Under 2.5", glavna: true },
    { o: "o15", u: "u15", ime: "Over/Under 1.5", glavna: false },
    { o: "o35", u: "u35", ime: "Over/Under 3.5", glavna: false },
  ] as const;

  const lambdaUk = analiza?.lambdaUkupno ?? null;

  // ── KONKRETAN TIP: jedna strana 2.5 linije + kvota + EV + Kelly ulog + sigurnosna linija ──
  let tip: null | {
    strana: "Više" | "Manje"; p: number; kv: number | null; edge: number | null; ulog: number;
    sigLabel: string; sigP: number | null; sigKv: number | null;
    altStrana: string; altP: number | null;
  } = null;
  if (analiza) {
    const oP = analiza.final["o25"] ?? null, uP = analiza.final["u25"] ?? null;
    const oK = bundle?.kvote["o25"] ?? null, uK = bundle?.kvote["u25"] ?? null;
    const kandidati = [
      { strana: "Više" as const, key: "o25", p: oP, kv: oK, edge: oP != null && oK != null ? oP * oK - 1 : null,
        sigLabel: "Više od 1.5", sigP: analiza.final["o15"] ?? null, sigKv: bundle?.kvote["o15"] ?? null },
      { strana: "Manje" as const, key: "u25", p: uP, kv: uK, edge: uP != null && uK != null ? uP * uK - 1 : null,
        sigLabel: "Manje od 3.5", sigP: analiza.final["u35"] ?? null, sigKv: bundle?.kvote["u35"] ?? null },
    ];
    const isplativi = kandidati.filter((c) => c.edge != null && c.edge > 0).sort((a, b) => b.edge! - a.edge!);
    const poProb = kandidati.filter((c) => c.p != null).sort((a, b) => b.p! - a.p!);
    const c = isplativi[0] ?? poProb[0]!;
    const kelly = analiza.kelly[c.key];
    const ulog = kelly != null
      ? Math.min(3, Math.max(0, kelly * 100))
      : c.kv != null && c.p != null && c.kv > 1
        ? Math.max(0, Math.min(3, ((c.p * c.kv - 1) / (c.kv - 1)) * 25))
        : 0;
    tip = {
      strana: c.strana,
      p: c.p!,
      kv: c.kv ?? null,
      edge: c.edge ?? null,
      ulog,
      sigLabel: c.sigLabel,
      sigP: c.sigP,
      sigKv: c.sigKv,
      altStrana: c.strana === "Više" ? "Manje" : "Više",
      altP: (c.strana === "Više" ? uP : oP),
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Gauge className="h-5 w-5 text-cyan-400" /> 2.5 Pro
          </h1>
          <p className="text-xs text-muted-foreground">
            Over/Under golovi — matrica rezultata kalibrirana tržištem i formom, fer kvote, edge i Kelly.
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
                    {tip.strana} 2.5{tip.kv != null ? ` @ ${tip.kv.toFixed(2)}` : " (fer kvota dolje)"}
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
                        {tip.altStrana} 2.5{tip.altP != null ? ` ${fmtPct(tip.altP)}` : ""}
                      </div>
                    </div>
                  </div>
                  {tip.sigP != null && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      🛡️ Sigurnosna linija: <b className="text-foreground">{tip.sigLabel}</b> (model {fmtPct(tip.sigP)}{tip.sigKv != null ? ` @ ${tip.sigKv.toFixed(2)}` : ""}) — ako ti je glavni tip pretežak, tu ide manji ulog.
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    Odabir: najveći edge među isplativim stranama 2.5 linije; ako nijedna nema edge, strana s većom vjerojatnošću.
                  </div>
                </div>
              )}

              {/* Očekivani golovi — "termometar" */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-background/50 p-3 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">λ Domaćin</div>
                  <div className="text-2xl font-black tabular-nums text-cyan-300">{analiza.lambdaDom.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">Ukupno očekivano</div>
                  <div className="text-3xl font-black tabular-nums text-primary">{analiza.lambdaUkupno.toFixed(2)}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {lambdaUk != null && (lambdaUk > 3.1 ? "ofenzivan meč" : lambdaUk < 2.1 ? "defenzivan meč" : "uravnotežen")}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">μ Gost</div>
                  <div className="text-2xl font-black tabular-nums text-cyan-300">{analiza.lambdaGost.toFixed(2)}</div>
                </div>
              </div>

              {/* Tržišta */}
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Tržište</th>
                      <th className="px-3 py-2 text-right">Vjerojatnost</th>
                      <th className="px-3 py-2 text-right">Fer kvota</th>
                      <th className="px-3 py-2 text-right">Kvota API</th>
                      <th className="px-3 py-2 text-right">Edge</th>
                      <th className="px-3 py-2 text-right">Kelly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LINIJE.flatMap((l) =>
                      (["o", "u"] as const).map((strana) => {
                        const k = strana === "o" ? l.o : l.u;
                        const p = analiza.final[k];
                        const kvota = bundle?.kvote[k];
                        const e = p != null && kvota != null ? p * kvota - 1 : null;
                        const rec = e != null && e >= 0.02;
                        return (
                          <tr key={k} className={`border-t border-border ${l.glavna ? "bg-primary/5" : ""}`}>
                            <td className="px-3 py-2 font-medium">
                              {l.glavna && <Target className="mr-1 inline h-3 w-3 text-primary" />}
                              {strana === "o" ? "Over" : "Under"} {l.ime.split(" ")[1]}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold">{p != null ? fmtPct(p) : "—"}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                              {p != null ? (1 / p).toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{kvota?.toFixed(2) ?? "—"}</td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${e != null ? edgeBoja(e) : ""}`}>
                              {e != null ? `${(e * 100).toFixed(1)}%` : "—"}
                              {rec && <CheckCircle2 className="ml-1 inline h-3 w-3 text-emerald-400" />}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                              {e != null && e > 0 && analiza.kelly[k] != null ? `${(analiza.kelly[k]! * 100).toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>

              {/* Distribucija golova iz matrice */}
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Brain className="h-3 w-3" /> Distribucija ukupnih golova
                </div>
                <div className="grid grid-cols-6 gap-1.5 text-center text-[10px]">
                  {["g0", "g1", "g2", "g3", "g4", "g5+"].map((k) => {
                    const p = analiza.final[k];
                    return (
                      <div key={k} className="rounded-lg bg-muted/40 p-2">
                        <div className="text-muted-foreground">{k === "g5+" ? "5+" : k.slice(1)} golova</div>
                        <div className="font-mono text-xs font-bold">{p != null ? fmtPct(p) : "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Faktori */}
              {analiza.faktori.length > 0 && (
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Što model gleda</div>
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
            </>
          )}
        </div>
      )}
      {settings && <SettingsModal open={settings} onClose={() => setSettings(false)} />}
    </div>
  );
}
