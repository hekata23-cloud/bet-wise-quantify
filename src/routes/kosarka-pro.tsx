/* ============================================================
   Košarka Pro — predikcijska kartica (kosarka)
   Motor: sportovi-motor.ts (forme s razdvojbom, λ + šrinkanje,
   prednost domaćih, logistička pobjeda, O/U preko σ, kalibracija
   tržištem, KONKRETAN TIP s EV i 1/4 Kellyjem)
   Podaci: sportovi.functions.ts (v1.basketball.api-sports.io preko
   sportovi-guarda — red + keš + retry + stale, 100 poziva/dan za
   ovaj sport NE MOGU biti oboreni ovom karticom)
   ============================================================ */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Dribbble,
  RefreshCw,
  Search,
  Target,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { getSportBundle, getSportUtakmice, type SportBundle, type SportUtakmica } from "@/lib/sportovi.functions";
import { sportAnaliza, type SportIzlaz } from "@/lib/sportovi-motor";
import { zapisiTip } from "@/lib/dnevnik";
import { getApiKey, zagrebDay } from "@/lib/zlatni-guard";

export const Route = createFileRoute("/kosarka-pro")({
  head: () => ({
    meta: [{ title: "Košarka Pro · Precision Check" }],
  }),
  component: KosarkaProPage,
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
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`premašio ${ms / 1000} s`)), ms)),
  ]);
}
function kellyUlog(p: number, kvota: number) {
  if (kvota <= 1 || p <= 0) return 0;
  return Math.max(0, Math.min(3, ((p * kvota - 1) / (kvota - 1)) * 25));
}

function KosarkaProPage() {
  const [date, setDate] = useState(zagrebDay());
  const [utakmice, setUtakmice] = useState<SportUtakmica[]>([]);
  const [status, setStatus] = useState("");
  const [ucitam, setUcitam] = useState(false);
  const [trazim, setTrazim] = useState("");
  const [odabrana, setOdabrana] = useState<SportUtakmica | null>(null);
  const [analiziram, setAnaliziram] = useState(false);
  const [bundle, setBundle] = useState<SportBundle | null>(null);
  const [analiza, setAnaliza] = useState<SportIzlaz | null>(null);
  const [settings, setSettings] = useState(false);

  const ucitaj = async (dan: string, force = false) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatus("Prvo unesi API-Sports ključ u Postavkama (⚙️) i pretplati besplatni plan za kosarka.");
      setSettings(true);
      return;
    }
    setUcitam(true);
    setStatus("Učitavam utakmice za " + dan + "…");
    const ck = `kosa.fix.${dan}`;
    try {
      const kes = force ? null : localStorage.getItem(ck);
      const r = kes ? (JSON.parse(kes) as { error: string | null; utakmice: SportUtakmica[] })
        : await getSportUtakmice({ data: { sport: "kosarka", date: dan, apiKey } });
      if (!force && !kes) localStorage.setItem(ck, JSON.stringify(r));
      if (r.error) {
        setUtakmice([]);
        setStatus(
          r.error.includes("ACCOUNT")
            ? `API je odgovorio: ${r.error} — otvori api-sports.io dashboard → API-KEY i pretplati BESPLATNI plan za kosarka (isti ključ radi za sve sportove).`
            : `Učitavanje nije uspjelo: ${r.error}`,
        );
      } else {
        setUtakmice(r.utakmice);
        setStatus(r.utakmice.length
          ? `Učitano ${r.utakmice.length} utakmica. Klikni utakmicu za analizu.`
          : "Nema nadolazećih utakmica za taj dan.");
      }
    } catch {
      setStatus("Greška pri dohvatu utakmica.");
    }
    setUcitam(false);
  };

  const analiziraj = async (u: SportUtakmica) => {
    const apiKey = getApiKey();
    if (!apiKey) { setStatus("Nedostaje API ključ."); setSettings(true); return; }
    setOdabrana(u);
    setAnaliziram(true);
    setBundle(null);
    setAnaliza(null);
    setStatus(`Analiziram ${u.home} — ${u.away}…`);
    const ck = `kosa.bundle.v1.${u.id}`;
    const dohvati = async (): Promise<SportBundle> =>
      (await withTimeout(
        getSportBundle({ data: { sport: "kosarka", id: u.id, homeId: u.homeId, awayId: u.awayId, leagueId: u.leagueId, season: u.season, apiKey } }),
        90_000,
      )) as SportBundle;
    try {
      const kes = localStorage.getItem(ck);
      let b: SportBundle;
      if (kes) {
        b = JSON.parse(kes) as SportBundle;
      } else {
        try {
          setStatus("Dohvaćam forme i kvote (API red, do 90 s)…");
          b = await dohvati();
        } catch {
          setStatus("Prvi pokušaj nije došao do kraja — pokušavam još jednom…");
          b = await dohvati();
        }
      }
      if (!kes && !b.error) localStorage.setItem(ck, JSON.stringify(b));
      setBundle(b);
      try {
        const a = sportAnaliza({
          sport: "kosarka",
          kvote: b.kvote ?? {},
          linija: b.linija ?? null,
          formaDom: b.formaDom,
          formaGost: b.formaGost,
          brojKladionica: b.knjiga,
        });
        setAnaliza(a);
        // Dnevnik: zapiši konkretni tip da Dnevnik može ocijeniti karticu.
        if (a.tip) {
          const t = a.tip;
          const ou = t.kljuc === "over" || t.kljuc === "under";
          zapisiTip({
            sport: "kosarka",
            kartica: "Košarka Pro",
            utakmica: `${u.home} — ${u.away}`,
            liga: u.league,
            fixtureId: u.id,
            tip: t.kvota != null ? `${t.label} @ ${t.kvota.toFixed(2)}` : t.label,
            p: t.p,
            kvota: t.kvota,
            provjera: ou
              ? { vrsta: "ou", strana: t.kljuc as "over" | "under", linija: b.linija ?? 0 }
              : { vrsta: "1x2", strana: t.kljuc as "1" | "X" | "2" },
          });
        }
        if (b.error)
          setStatus(`⚠️ ${b.error} — ispod je analiza s podacima koji postoje.`);
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

  const p1 = analiza?.final["1"] ?? null;
  const pX = analiza?.final["X"] ?? null;
  const p2 = analiza?.final["2"] ?? null;
  const kv1 = bundle?.kvote["1"];
  const kv2 = bundle?.kvote["2"];
  const kvX = bundle?.kvote["X"];
  const linija = bundle?.linija ?? null;
  const pOver = analiza?.final["over"] ?? null;
  const pUnder = analiza?.final["under"] ?? null;
  const kvOver = bundle?.kvote["over"];
  const kvUnder = bundle?.kvote["under"];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Dribbble className="h-6 w-6 text-orange-400" /> Košarka Pro
          </h1>
          <p className="text-sm text-slate-400">
            Pobjeda + Over/Under bodova · motor miješa formu, prednost domaćih i tržište
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white"
          />
          <button
            onClick={() => ucitaj(date)}
            disabled={ucitam}
            className="flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${ucitam ? "animate-spin" : ""}`} /> Učitaj
          </button>
          <button onClick={() => setSettings(true)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            ⚙️
          </button>
        </div>
      </div>

      {status && (
        <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
          {status}
        </div>
      )}

      <input
        value={trazim}
        onChange={(e) => setTrazim(e.target.value)}
        placeholder="Traži tim ili ligu…"
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Lista utakmica */}
        <div className="space-y-2">
          {filtrirane.map((u) => (
            <button
              key={u.id}
              onClick={() => analiziraj(u)}
              disabled={analiziram}
              className={`w-full rounded-xl border px-3 py-2 text-left transition hover:border-orange-500/60 ${
                odabrana?.id === u.id ? "border-orange-500 bg-orange-500/10" : "border-slate-700 bg-slate-900/60"
              } disabled:opacity-50`}
            >
              <div className="text-sm font-medium text-white">{u.home} — {u.away}</div>
              <div className="text-xs text-slate-400">{u.league} · {vremeno(u.time)}</div>
            </button>
          ))}
          {!filtrirane.length && !ucitam && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-6 text-center text-sm text-slate-500">
              Učitaj utakmice gumbom gore.
            </div>
          )}
        </div>

        {/* Analiza */}
        <div className="space-y-3">
          {analiziram && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <Brain className="h-4 w-4 animate-pulse text-orange-400" /> {status || "Analiziram…"}
            </div>
          )}

          {analiza && !analiziram && (
            <>
              {/* Pobjeda */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Tko pobjeđuje?</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ocjenaBoja(analiza.ocjena)}`}>
                    {analiza.ocjena} · povjerenje {analiza.povjerenje}/100
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  {p1 != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{odabrana?.home} {kv1 ? `@ ${kv1.toFixed(2)}` : ""}</span>
                      <span className="font-semibold text-white">{fmtPct(p1)}</span>
                    </div>
                  )}
                  {pX != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Nerješeno {kvX ? `@ ${kvX.toFixed(2)}` : ""}</span>
                      <span className="font-semibold text-white">{fmtPct(pX)}</span>
                    </div>
                  )}
                  {p2 != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{odabrana?.away} {kv2 ? `@ ${kv2.toFixed(2)}` : ""}</span>
                      <span className="font-semibold text-white">{fmtPct(p2)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Očekivani učinak: {odabrana?.home} {analiza.lambdaDom.toFixed(1)} : {analiza.lambdaGost.toFixed(1)} {odabrana?.away}
                </div>
              </div>

              {/* Over/Under */}
              {linija != null && pOver != null && pUnder != null && (
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="mb-2 text-sm font-semibold text-white">Over/Under {linija} bodova</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Over {linija} {kvOver ? `@ ${kvOver.toFixed(2)}` : ""}</span>
                      <span className="font-semibold text-white">{fmtPct(pOver)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Under {linija} {kvUnder ? `@ ${kvUnder.toFixed(2)}` : ""}</span>
                      <span className="font-semibold text-white">{fmtPct(pUnder)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Očekivani ukupni zbroj: {analiza.ukupnoOcekivano.toFixed(1)} · raspršenje σ={analiza.sigmaUkupno.toFixed(1)}
                  </div>
                </div>
              )}

              {/* KONKRETAN TIP */}
              {analiza.tip ? (
                <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-orange-300">
                    <Target className="h-4 w-4" /> KONKRETAN TIP
                  </div>
                  <div className="text-lg font-bold text-white">{analiza.tip.label}</div>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-sm text-slate-300">
                    <span>Vjerojatnost: <b className="text-white">{fmtPct(analiza.tip.p)}</b></span>
                    <span>Kvota: <b className="text-white">{analiza.tip.kvota?.toFixed(2) ?? "—"}</b></span>
                    <span>Edge: <b className={edgeBoja(analiza.tip.edge)}>{(analiza.tip.edge * 100).toFixed(1)}%</b></span>
                    <span>EV: <b className={edgeBoja(analiza.tip.ev)}>{(analiza.tip.ev * 100).toFixed(1)}%</b></span>
                    <span>1/4 Kelly: <b className="text-white">{analiza.tip.kellyPct.toFixed(1)}% banke</b></span>
                    <span>Fer kvota: <b className="text-white">{(1 / analiza.tip.p).toFixed(2)}</b></span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">
                  Nema vrijednog tipa — model i tržište se slažu. Bolje ne igrati nego igrati bez edge-a.
                </div>
              )}

              {/* Faktori */}
              {analiza.faktori.length > 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="mb-1 text-sm font-semibold text-white">Šta je model vidio</div>
                  <ul className="space-y-1 text-xs text-slate-400">
                    {analiza.faktori.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
                </div>
              )}

              {/* Upozorenja */}
              {analiza.upozorenja.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-300">
                    <AlertTriangle className="h-4 w-4" /> Upozorenja
                  </div>
                  <ul className="space-y-1 text-xs text-amber-200/80">
                    {analiza.upozorenja.map((f, i) => <li key={i}>• {f}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}

          {!analiza && !analiziram && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-6 text-center text-sm text-slate-500">
              Odaberi utakmicu s lijeve strane.
            </div>
          )}
        </div>
      </div>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
