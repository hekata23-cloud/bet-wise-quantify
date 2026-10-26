/* ============================================================
   HT/FT BETA — kartica za prijelaze (Poluvrijeme / Kraj)
   Đđ: htft-beta-motor.ts (prijelazni engine)
   Podaci: htft-beta.functions.ts (kroz api-guard)
   ============================================================ */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Calendar,
  Cpu,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import {
  getBetaBundle,
  getBetaUtakmice,
  type BetaBundle,
  type BetaUtakmica,
} from "@/lib/htft-beta.functions";
import { betaAnaliza, type BetaAnaliza } from "@/lib/htft-beta-motor";
import { edge, kelly } from "@/lib/matematika";
import { getApiKey, zagrebDay } from "@/lib/zlatni-guard";
import { zapisiTip } from "@/lib/dnevnik";
import HTFTProPanel from "@/components/HTFTProPanel";
import PickBadgeBar from "@/components/PickBadgeBar";
import { analizaVig } from "@/lib/devig-shield";

export const Route = createFileRoute("/ht-ft-beta")({
  head: () => ({
    meta: [{ title: "HT/FT Beta · Prijelazni engine · Precision Check" }],
  }),
  component: HtFtBetaPage,
});

/* ---------- mala pomoćna prikazala ---------- */

const STANJA = ["1", "X", "2"] as const;
type Stanje = (typeof STANJA)[number];

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}
function vremeno(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("hr-HR", {
      timeZone: "Europe/Zagreb",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
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

/* ---------- Kartica ---------- */

function HtFtBetaPage() {
  const [date, setDate] = useState(zagrebDay());
  const [utakmice, setUtakmice] = useState<BetaUtakmica[]>([]);
  const [status, setStatus] = useState("");
  const [ucitam, setUcitam] = useState(false);
  const [trazim, setTrazim] = useState("");
  const [odabrana, setOdabrana] = useState<BetaUtakmica | null>(null);
  const [analiziram, setAnaliziram] = useState(false);
  const [bundle, setBundle] = useState<BetaBundle | null>(null);
  const [analiza, setAnaliza] = useState<BetaAnaliza | null>(null);
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
    const ck = `htfb.fix.${dan}`;
    try {
      const keš = force ? null : localStorage.getItem(ck);
      const r = keš
        ? (JSON.parse(keš) as { error: string | null; utakmice: BetaUtakmica[] })
        : await getBetaUtakmice({ data: { date: dan, apiKey } });
      if (!force && !keš) localStorage.setItem(ck, JSON.stringify(r));
      if (r.error) {
        setUtakmice([]);
        setStatus(`Učitavanje nije uspjelo: ${r.error}`);
      } else {
        setUtakmice(r.utakmice);
        setStatus(
          r.utakmice.length
            ? `Učitano ${r.utakmice.length} utakmica. Klikni utakmicu za prijelaznu analizu.`
            : "Nema nadolazećih utakmica za taj dan.",
        );
      }
    } catch {
      setStatus("Greška pri dohvatu utakmica.");
    }
    setUcitam(false);
  };

  const analiziraj = async (u: BetaUtakmica) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatus("Nedostaje API ključ.");
      setSettings(true);
      return;
    }
    setOdabrana(u);
    setAnaliziram(true);
    setBundle(null);
    setAnaliza(null);
    setStatus(`Analiziram ${u.home} — ${u.away}…`);
    const ck = `htfb.bundle.v3.${u.id}`;
    try {
      const keš = localStorage.getItem(ck);
      const b = keš
        ? (JSON.parse(keš) as BetaBundle)
        : await getBetaBundle({ data: { id: u.id, homeId: u.homeId, awayId: u.awayId, apiKey } });
      if (!keš) localStorage.setItem(ck, JSON.stringify(b));
      setBundle(b);
      if (b.error) {
        setStatus(`Analiza nije uspjela: ${b.error}`);
      } else {
        const a = betaAnaliza({
          kvote: b.kvote,
          formaDom: b.formaDom,
          formaGost: b.formaGost,
        });
        setAnaliza(a);
        // Dnevnik: zapiši najjaču HT/FT ćeliju da Dnevnik može ocijeniti karticu.
        const najD = [...a.celije].sort((x, y) => y.p - x.p)[0];
        if (najD) {
          zapisiTip({
            kartica: "HT/FT Beta",
            utakmica: `${u.home} — ${u.away}`,
            liga: u.league,
            fixtureId: u.id,
            tip: najD.kod,
            p: najD.p,
            kvota: b.htft[najD.kod] ?? null,
            provjera: { vrsta: "htft", kod: najD.kod },
          });
        }
        setStatus("");
      }
    } catch {
      setStatus("Greška pri analizi utakmice.");
    }
    setAnaliziram(false);
  };

  const filtrirane = utakmice.filter(
    (u) =>
      !trazim ||
      `${u.home} ${u.away} ${u.league} ${u.country}`.toLowerCase().includes(trazim.toLowerCase()),
  );

  const top3 = analiza ? [...analiza.celije].sort((a, b) => b.p - a.p).slice(0, 3) : [];

  // DE-VIG štit: kolika je marža na HT/FT tržištu (distorzija > 7%)
  const vig =
    bundle && analiza ? analizaVig(analiza.celije.map((c) => bundle.htft[c.kod] ?? 0)) : null;

  // Kandidati za oznake preporuke (55% pod / 65% safe / 4% value)
  const badgeKandidati =
    analiza && bundle
      ? analiza.celije
          .map((c) => {
            const o = bundle.htft[c.kod];
            return {
              tip: c.kod,
              trziste: "HT/FT",
              p: c.p,
              odds: o && o > 1.01 ? o : null,
              edge: o && o > 1.01 ? c.p * o - 1 : null,
            };
          })
          .filter((k) => k.odds != null)
      : [];

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Zaglavlje */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Cpu className="h-6 w-6 text-sky-400" /> HT/FT Beta
            </h1>
            <p className="text-sm text-slate-400">
              Prijelazni engine — modelira drugo poluvrijeme ovisno o stanju na odmoru.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            />
            <button
              onClick={() => ucitaj(date, true)}
              disabled={ucitam}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50"
            >
              {ucitam ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              Učitaj utakmice
            </button>
            <button
              onClick={() => setSettings(true)}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
              title="Postavke"
            >
              ⚙️
            </button>
          </div>
        </div>

        {status && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            {status}
          </div>
        )}

        {/* Lista utakmica */}
        {utakmice.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={trazim}
                onChange={(e) => setTrazim(e.target.value)}
                placeholder="Traži tim ili ligu…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
              />
            </div>
            <div className="max-h-80 overflow-y-auto">
              {filtrirane.map((u) => (
                <button
                  key={u.id}
                  onClick={() => analiziraj(u)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-800/60 ${odabrana?.id === u.id ? "bg-sky-950/50" : ""}`}
                >
                  <span className="truncate">
                    <span className="font-medium">{u.home}</span>
                    <span className="text-slate-500"> — </span>
                    <span className="font-medium">{u.away}</span>
                  </span>
                  <span className="ml-3 shrink-0 text-xs text-slate-500">
                    {vremeno(u.time)} · {u.league}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {analiziram && (
          <div className="flex items-center gap-3 rounded-xl border border-sky-800 bg-sky-950/40 px-4 py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-sky-400" />
            <span className="text-sm">
              Računam prijelazni engine (obrnuto inženjerstvo kvota + forma + dinamika 2.
              poluvremena)…
            </span>
          </div>
        )}

        {/* Analiza */}
        {analiza && bundle && odabrana && (
          <div className="space-y-6">
            {/* TOP 3 TIPA */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="h-5 w-5 text-emerald-400" /> Top HT/FT tipovi —{" "}
                {odabrana.home} vs {odabrana.away}
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                {top3.map((c, i) => {
                  const bk = bundle.htft[c.kod];
                  const e = bk ? edge(c.p, bk) : null;
                  const kel = bk ? kelly(c.p, bk) : null;
                  return (
                    <div
                      key={c.kod}
                      className="rounded-lg border border-slate-700 bg-slate-950 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold">{c.kod}</span>
                        <span
                          className={`rounded border px-2 py-0.5 text-xs font-bold ${ocjenaBoja(c.ocjena)}`}
                        >
                          {c.ocjena}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{c.label}</p>
                      <p className="mt-2 text-2xl font-extrabold text-emerald-400">{fmtPct(c.p)}</p>
                      <p className="text-xs text-slate-400">Fer kvota {c.ferOdd.toFixed(2)}</p>
                      {bk && (
                        <div className="mt-2 space-y-0.5 border-t border-slate-800 pt-2 text-xs">
                          <p className="text-slate-300">
                            Kladionica: <span className="font-semibold">{bk.toFixed(2)}</span>
                          </p>
                          <p className={edgeBoja(e ?? 0)}>
                            Edge: {((e ?? 0) * 100).toFixed(1)}%{" "}
                            {e !== null && e > 0 ? "✓ value" : ""}
                          </p>
                          {kel !== null && kel > 0 && (
                            <p className="text-slate-400">Kelly: {(kel * 100).toFixed(1)}% uloga</p>
                          )}
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-slate-500">
                        Prijelaz snaga: {fmtPct(c.prijelazSnaga)} · #{i + 1} po modelu
                      </p>
                    </div>
                  );
                })}
              </div>
              {analiza.sigurnosniPar && (
                <p className="mt-3 rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                  🛡 Sigurnosni par: <b>{analiza.sigurnosniPar.kodovi.join(" + ")}</b> — zajedno{" "}
                  {fmtPct(analiza.sigurnosniPar.p)} (glavni tip je slab od 22%).
                </p>
              )}
            </section>

            {/* HT/FT PRO — bivarijantna nadogradnja */}
            <HTFTProPanel lamH={analiza.lam} lamA={analiza.mu} kvote9={bundle.htft} />

            {/* OZNAKE PREPORUKE + VIG ŠTIT */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              {vig && (
                <p
                  className={`mb-2 rounded-lg px-3 py-2 text-xs ${vig.distorzija ? "bg-red-950/40 text-red-300" : "bg-slate-800/60 text-slate-300"}`}
                >
                  Vig tržišta: <b>{(vig.vig * 100).toFixed(1)}%</b> ({vig.metoda} de-vig)
                  {vig.distorzija
                    ? " — ⚠️ DISTORZIJA > 7%: kvote su teško natovarene maržom, pazi na cijenu."
                    : " — tržište igrivo."}
                </p>
              )}
              <PickBadgeBar kandidati={badgeKandidati} />
            </section>

            {/* PRIJELAZNA MATRICA */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <ArrowDownUp className="h-5 w-5 text-sky-400" /> Prijelazna matrica: Poluvrijeme →
                Kraj
              </h2>
              <p className="mb-3 text-xs text-slate-400">
                P(završni ishod | ishod na odmoru). Dijagonala (zeleno) = rezultat se drži; izvan
                dijagonale = prijelaz/preokret.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-80 text-center text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="py-1 text-left">HT ↓ / FT →</th>
                      {STANJA.map((s) => (
                        <th key={s} className="py-1">
                          {s === "1" ? "1 (dom)" : s === "X" ? "X" : "2 (gost)"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STANJA.map((hs) => (
                      <tr key={hs}>
                        <td className="py-1.5 text-left font-semibold">{hs}</td>
                        {STANJA.map((fs) => (
                          <td key={fs} className="px-1.5 py-1.5">
                            <span
                              className={`inline-block w-full rounded-md px-2 py-1.5 font-semibold ${hs === fs ? "bg-emerald-900/50 text-emerald-300" : "bg-slate-800/70 text-slate-200"}`}
                            >
                              {fmtPct(analiza.prijelazi[hs][fs])}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-lg bg-slate-950 px-3 py-2">
                  <span className="text-slate-400">Rezultat se DRŽI:</span>{" "}
                  <b className="text-emerald-400">{fmtPct(analiza.drzanje)}</b>
                  <div className="mt-1 h-1.5 rounded bg-slate-800">
                    <div
                      className="h-1.5 rounded bg-emerald-500"
                      style={{ width: `${analiza.drzanje * 100}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950 px-3 py-2">
                  <span className="text-slate-400">PREKID/okretanje:</span>{" "}
                  <b className="text-amber-400">{fmtPct(analiza.okretanje)}</b>
                  <div className="mt-1 h-1.5 rounded bg-slate-800">
                    <div
                      className="h-1.5 rounded bg-amber-500"
                      style={{ width: `${analiza.okretanje * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* SVI ISHODI */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-lg font-semibold">Svih 9 ishoda (fer vjerojatnosti)</h2>
              <div className="space-y-1.5">
                {[...analiza.celije]
                  .sort((a, b) => b.p - a.p)
                  .map((c) => {
                    const bk = bundle.htft[c.kod];
                    const e = bk ? edge(c.p, bk) : null;
                    return (
                      <div key={c.kod} className="flex items-center gap-3 text-sm">
                        <span className="w-10 shrink-0 font-bold">{c.kod}</span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800">
                          <div
                            className={`h-4 rounded ${c.ht === c.ft ? "bg-emerald-600/80" : "bg-sky-600/80"}`}
                            style={{ width: `${Math.max(2, c.p * 100)}%` }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right font-semibold">
                          {fmtPct(c.p)}
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs text-slate-500">
                          fer {c.ferOdd.toFixed(2)}
                        </span>
                        {bk ? (
                          <span className={`w-24 shrink-0 text-right text-xs ${edgeBoja(e ?? 0)}`}>
                            {bk.toFixed(2)} · {((e ?? 0) * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="w-24 shrink-0 text-right text-xs text-slate-700">—</span>
                        )}
                      </div>
                    );
                  })}
              </div>
              {bundle.htftIzvor && (
                <p className="mt-2 text-xs text-slate-500">
                  HT/FT kvote izvora: {bundle.htftIzvor}
                </p>
              )}
            </section>

            {/* POUZDANOST */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
                <h3 className="mb-2 font-semibold">Motor</h3>
                <ul className="space-y-1 text-slate-300">
                  <li>
                    Očekivani golovi: λ <b>{analiza.lam.toFixed(2)}</b> / μ{" "}
                    <b>{analiza.mu.toFixed(2)}</b> ({analiza.izvorLam})
                  </li>
                  <li>
                    Rekonstrukcija tržišta: <b>{(analiza.kvalitetaTrzista * 100).toFixed(0)}%</b>{" "}
                    (kvaliteta podataka)
                  </li>
                  <li>
                    Entropija: <b>{(analiza.entropija * 100).toFixed(0)}%</b>{" "}
                    {analiza.entropija > 0.9 ? "⚠️ teško predvidivo" : "ok"}
                  </li>
                  <li>
                    Model 1X2: {fmtPct(analiza.ft.p1)} / {fmtPct(analiza.ft.pX)} /{" "}
                    {fmtPct(analiza.ft.p2)}
                  </li>
                  {analiza.trziste1x2 && (
                    <li>
                      Tržište 1X2: {fmtPct(analiza.trziste1x2.p1)} / {fmtPct(analiza.trziste1x2.pX)}{" "}
                      / {fmtPct(analiza.trziste1x2.p2)} (odstupanje {analiza.odstupanje.toFixed(1)}{" "}
                      pb)
                    </li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-400" /> Upozorenja
                </h3>
                {analiza.upozorenja.length || bundle.upozorenja.length ? (
                  <ul className="list-inside list-disc space-y-1 text-slate-300">
                    {[...analiza.upozorenja, ...bundle.upozorenja].map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">
                    Nema — podaci potpuni, model u skladu s tržištem.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        <p className="pb-4 text-center text-xs text-slate-600">
          HT/FT Beta · prijelazni engine (obrnuto inženjerstvo tržišta + Dinamika 2. poluvremena +
          kalibracija) · nije savjet za klađenje
        </p>
      </div>
      {settings && <SettingsModal open={settings} onClose={() => setSettings(false)} />}
    </div>
  );
}
