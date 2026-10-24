/* ═══════════════════════════════════════════════════════════════════
   MATCH INSIGHT PANEL — profesionalna analiza (v3)
   NOVO v3: Lineup Radar (postave + pomak λ) · Live Engine (uživo
   preračunavanje) · SGP Builder (copula) · AI kontekst za Lunu/Oriona
   ═══════════════════════════════════════════════════════════════════
   0. Anti-Loss Filter  — SKIP / HIGH VOLATILITY ili GOLD (edge ≥ 5%)
   1. Match Info        — timovi, liga, vrijeme, kvote
   2. Predikcija Core   — glavni tip + EV + ¼ Kelly + "Why this pick?" drawer
   3. Alternativni tip  — sigurnija opcija
   4. Obrazloženje      — SARP faze
   5. Rizici/Upozorenja
   6. Model Confidence  — A/B/C + Brier kalibracija
   7. Live Kvote Tracker — + Odds Radar (Smart Money Alert)
   8. CLV Indikator
   9. Simulacije MC

   Panel radi sam: prima utakmicu + kvote + goals-analizu, interni
   poziva SARP (7 faza), anti-loss engine, Brier kalibraciju,
   odds-tracker historiju i Monte Carlo.
   ═══════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BookOpen, BrainCircuit, ChevronDown,
  Dices, Info, LineChart, ShieldCheck, Target, TrendingDown, TrendingUp,
  Ban, HelpCircle,
} from "lucide-react";
import { sarpBrain, type SarpIzlaz } from "@/lib/sarp-brain";
import {
  clvZaTip, kretanjeKvota, spremiSnapshot, snapshoti,
  type KretanjeKvote,
} from "@/lib/odds-tracker";
import { evaluirajAntiLoss, brierKalibracija } from "@/lib/anti-loss";
import { OddsRadar } from "@/components/OddsRadar";
import { LineupRadar, type LineupInfo } from "@/components/LineupRadar";
import { LiveMotorPanel } from "@/components/LiveMotorPanel";
import { SgpBuilder } from "@/components/SgpBuilder";
import { spremiKontekstMeca } from "@/lib/ai-context";
import type { GoalsIzlaz } from "@/lib/goals-motor";
import type { FormaGolovi, OkolisUlaz, SudacUlaz } from "@/lib/math-engine";
import { normalizirajKontekst } from "@/lib/safe-math";

export type MatchInsightProps = {
  utakmica: {
    id: number;
    home: string;
    away: string;
    league: string;
    country?: string;
    time?: string;
  };
  kvote: Record<string, number>;
  brojKladionica?: number;
  formaDom?: FormaGolovi | null;
  formaGost?: FormaGolovi | null;
  /** izlaz goals-motora kartice (BTTS Ultra / 2.5 Pro) — fuzionira se u SARP */
  goals?: GoalsIzlaz | null;
};

function fmtPct(x: number) { return `${(x * 100).toFixed(1)}%`; }

const LABELI: Record<string, string> = {
  "1": "1 · domaćin", "X": "X · neriješeno", "2": "2 · gost",
  bttsDa: "GG — da", bttsNe: "NG — ne",
  o15: "O1.5", u15: "U1.5", o25: "O2.5", u25: "U2.5", o35: "O3.5", u35: "U3.5",
};

function ocjenaKlasa(o: string) {
  if (o === "A") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (o === "B") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-slate-500/20 text-slate-300 border-slate-500/40";
}

export function MatchInsightPanel(props: MatchInsightProps) {
  const { utakmica, kvote, goals } = props;

  /* ── OKOLIS I SUDAC (v6) — opcionalni manualni unos. Prazno =
     identitet: model se NIJE mijenja dok korisnik ne unese podatke. */
  const [okolnostiOpen, setOkolnostiOpen] = useState(false);
  const [vjetar, setVjetar] = useState("");
  const [kisa, setKisa] = useState(false);
  const [teren, setTeren] = useState<"dobro" | "mokro" | "lose">("dobro");
  const [kartona, setKartona] = useState("");
  const [penali, setPenali] = useState("");
  const okolisUlaz: OkolisUlaz | null = useMemo(() => {
    const v = parseFloat(vjetar.replace(",", "."));
    const stariTeren = teren !== "dobro";
    if (!(Number.isFinite(v) && v > 0) && !kisa && !stariTeren) return null;
    return {
      ...(Number.isFinite(v) && v > 0 ? { vjetarKmh: v } : {}),
      ...(kisa ? { kisa: true } : {}),
      ...(stariTeren ? { teren } : {}),
    };
  }, [vjetar, kisa, teren]);
  const sudacUlaz: SudacUlaz | null = useMemo(() => {
    const k = parseFloat(kartona.replace(",", "."));
    const p = parseFloat(penali.replace(",", "."));
    if (!Number.isFinite(k) && !Number.isFinite(p)) return null;
    return {
      ...(Number.isFinite(k) ? { kartonaPoUtakmici: k } : {}),
      ...(Number.isFinite(p) ? { penaliPoUtakmici: p } : {}),
    };
  }, [kartona, penali]);

  // UNIVERSAL MATCH CONTEXT (v7): normalizirani kontekst utakmice —
  // isti objekt ide u motor (xG/motivacija) i u AI prompt (Luna/Orion).
  const universalKontekst = useMemo(
    () =>
      normalizirajKontekst({
        sport: "nogomet",
        fixtureId: utakmica.id,
        domacin: utakmica.home,
        gost: utakmica.away,
        liga: utakmica.league,
        vjetarKmh: okolisUlaz?.vjetarKmh ?? 0,
        kisa: okolisUlaz?.kisa === true,
        refCardsPerGame: sudacUlaz?.kartonaPoUtakmici ?? 0,
        refPensPerGame: sudacUlaz?.penaliPoUtakmici ?? 0,
        brojKladionica: props.brojKladionica ?? 0,
      }),
    [utakmica.id, utakmica.home, utakmica.away, utakmica.league, okolisUlaz, sudacUlaz, props.brojKladionica],
  );

  const sarp: SarpIzlaz = useMemo(
    () =>
      sarpBrain({
        utakmica,
        kvote,
        brojKladionica: props.brojKladionica,
        formaDom: props.formaDom ?? null,
        formaGost: props.formaGost ?? null,
        goals: goals ?? null,
        okolis: okolisUlaz,
        sudac: sudacUlaz,
        kontekst: universalKontekst,
      }),
    [utakmica, kvote, props.brojKladionica, props.formaDom, props.formaGost, goals, okolisUlaz, sudacUlaz, universalKontekst],
  );

  // historija kvota: svaki novi dohvat = snapshot
  const [nSnimaka, setNSnimaka] = useState(0);
  const [kretanje, setKretanje] = useState<KretanjeKvote[]>([]);
  useEffect(() => {
    if (!utakmica.id || !kvote || !Object.keys(kvote).length) return;
    spremiSnapshot(utakmica.id, kvote);
    setNSnimaka(snapshoti(utakmica.id).length);
    setKretanje(kretanjeKvota(utakmica.id, sarp.coreTip.kljuc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utakmica.id, JSON.stringify(kvote)]);

  const clv = clvZaTip(utakmica.id, sarp.coreTip.kljuc);
  const [otvoreneFaze, setOtvoreneFaze] = useState(false);
  const [otvoriZasto, setOtvoriZasto] = useState(false);
  const [lineupInfo, setLineupInfo] = useState<LineupInfo | null>(null);

  /* ── AI KONTEKST — najsvježija analiza ide Lunama/Orionu u prompt ── */
  useEffect(() => {
    if (!utakmica.id || !sarp.coreTip) return;
    spremiKontekstMeca({
      naslov: sarp.matchInfo.naslov,
      liga: sarp.matchInfo.liga,
      vrijeme: sarp.matchInfo.vrijeme,
      kvote,
      lambdaDom: sarp.lambdaDom,
      lambdaGost: sarp.lambdaGost,
      lambdaUkupno: sarp.lambdaUkupno,
      konsenzus: sarp.konsenzus,
      coreTip: {
        label: sarp.coreTip.label, kljuc: sarp.coreTip.kljuc, p: sarp.coreTip.p,
        kvota: sarp.coreTip.kvota, edge: sarp.coreTip.edge, kellyPct: sarp.coreTip.kellyPct,
      },
      altTip: sarp.altTip
        ? { label: sarp.altTip.label, p: sarp.altTip.p, kvota: sarp.altTip.kvota }
        : null,
      mc: {
        btts: sarp.mc.btts, o15: sarp.mc.o15, o25: sarp.mc.o25, o35: sarp.mc.o35,
        p1: sarp.mc.p1, pX: sarp.mc.pX, p2: sarp.mc.p2,
      },
      ocjena: sarp.ocjena,
      povjerenje: sarp.povjerenje,
      brojIzvora: sarp.brojIzvora,
      rizici: sarp.rizici,
      postave: lineupInfo
        ? {
            potvrdjene: lineupInfo.potvrdjene,
            izasli: lineupInfo.utjecaj?.opisi ?? [],
            procenatPomaka: lineupInfo.utjecaj?.imaUtjecaj ? lineupInfo.utjecaj.procenat : null,
          }
        : null,
      live: null,
      kvant: sarp.kvant,
      universal: universalKontekst,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utakmica.id, JSON.stringify(kvote), sarp, lineupInfo, universalKontekst]);

  /* ── ANTI-LOSS ENGINE ──
     sukob modela: Skellam vs grid + MC vs analitički model (O2.5) */
  const mcO25 = sarp.mc.o25;
  const modelO25 = goals?.final["o25"] ?? sarp.konsenzus["o25"] ?? mcO25;
  const mcRaz = Math.abs(mcO25 - modelO25);
  const antiLoss = useMemo(
    () =>
      evaluirajAntiLoss({
        kvote,
        edge: sarp.coreTip.edge,
        povjerenje: sarp.povjerenje,
        suglasnostModela: sarp.suglasnostSkellam,
        mcVsModelRazlika: mcRaz,
      }),
    [kvote, sarp.coreTip.edge, sarp.povjerenje, sarp.suglasnostSkellam, mcRaz],
  );

  /* ── MODEL AGREEMENT (koliko od 3 kvantitativna modela se slažu) ── */
  const slazu = 1
    + (sarp.suglasnostSkellam >= 0.85 ? 1 : 0)
    + (mcRaz <= 0.10 ? 1 : 0);

  /* ── BRIER KALIBRACIJA ── */
  const kal = brierKalibracija();

  const faktori: string[] = [
    ...(goals?.faktori ?? []).slice(0, 4),
    ...sarp.faze
      .filter((f) => f.broj >= 2 && f.broj <= 5)
      .map((f) => `${f.naziv}: ${f.sazetak}`),
  ].slice(0, 6);

  return (
    <div className="space-y-3">
      {/* 0 · ANTI-LOSS FILTER */}
      <section className={`rounded-xl border p-4 ${
        antiLoss.status === "SKIP" ? "border-red-500/40 bg-red-500/10"
        : antiLoss.status === "GOLD" ? "border-emerald-500/40 bg-emerald-500/10"
        : antiLoss.status === "VALUE" ? "border-amber-500/40 bg-amber-500/10"
        : "border-border bg-card"
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {antiLoss.status === "SKIP"
              ? <><Ban className="h-4 w-4 text-red-400" /> Anti-Loss Filter</>
              : <><ShieldCheck className="h-4 w-4 text-emerald-400" /> Anti-Loss Filter</>}
          </div>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${antiLoss.badgeClass}`}>
            {antiLoss.badge}
          </span>
        </div>
        {antiLoss.status === "SKIP" && (
          <ul className="mt-1.5 space-y-1 text-xs text-red-200/90">
            {antiLoss.razlozi.map((r, i) => <li key={i}>• {r}</li>)}
            <li>• Predikcija dolje je INFORMACIJA — anti-loss pravilo kaže: PROĐI (no bet).</li>
          </ul>
        )}
        {antiLoss.status !== "SKIP" && antiLoss.entropija != null && (
          <p className="mt-1 text-xs text-muted-foreground">
            Entropija ishoda: {Math.round(antiLoss.entropija * 100)}%
            {antiLoss.edgePct != null ? ` · edge glavnog tipa: ${antiLoss.edgePct.toFixed(1)}%` : ""}
            {" "}— konflikt signala nije detektiran.
          </p>
        )}
      </section>

      {/* 0.5 · POSTAVE — Lineup Radar */}
      <LineupRadar
        fixtureId={utakmica.id}
        dom={utakmica.home}
        gost={utakmica.away}
        onImpact={setLineupInfo}
      />

      {/* 0.6 · LIVE ENGINE — preračunavanje u tijeku utakmice */}
      <LiveMotorPanel
        fixtureId={utakmica.id}
        dom={utakmica.home}
        gost={utakmica.away}
        lambdaDom={sarp.lambdaDom}
        lambdaGost={sarp.lambdaGost}
      />

      {/* 0.7 · SGP BUILDER — kombinacije unutar istog meča (copula) */}
      <SgpBuilder
        naslov={sarp.matchInfo.naslov}
        liga={sarp.matchInfo.liga}
        kvote={kvote}
        konsenzus={sarp.konsenzus}
      />

      {/* 0.8 · OKOLNOSTI — vjetar/kiša/teren + profil suca (opcionalno) */}
      <section className="rounded-xl border border-border bg-card p-4">
        <button
          className="flex w-full items-center justify-between text-sm font-semibold"
          onClick={() => setOkolnostiOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4 text-slate-400" /> Okolnosti (vjetar · kiša · sudac)
          </span>
          {(okolisUlaz || sudacUlaz)
            ? <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">AKTIVNO</span>
            : <span className="text-xs font-normal text-muted-foreground">bez podataka = identitet</span>}
        </button>
        {okolnostiOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Vjetar (km/h)</span>
              <input value={vjetar} onChange={(e) => setVjetar(e.target.value)} placeholder="npr. 38"
                className="rounded-md border border-border bg-background px-2 py-1.5" inputMode="decimal" />
            </label>
            <label className="flex items-end gap-2 pb-1.5">
              <input type="checkbox" checked={kisa} onChange={(e) => setKisa(e.target.checked)} className="h-4 w-4" />
              <span>Jaka kiša</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Teren</span>
              <select value={teren} onChange={(e) => setTeren(e.target.value as "dobro" | "mokro" | "lose")}
                className="rounded-md border border-border bg-background px-2 py-1.5">
                <option value="dobro">dobro</option>
                <option value="mokro">mokro</option>
                <option value="lose">loše</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Sudac: kartona/ut.</span>
              <input value={kartona} onChange={(e) => setKartona(e.target.value)} placeholder="npr. 5.6"
                className="rounded-md border border-border bg-background px-2 py-1.5" inputMode="decimal" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Sudac: penali/ut.</span>
              <input value={penali} onChange={(e) => setPenali(e.target.value)} placeholder="npr. 0.45"
                className="rounded-md border border-border bg-background px-2 py-1.5" inputMode="decimal" />
            </label>
          </div>
        )}
      </section>

      {/* 1 · MATCH INFO */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-sky-400" /> Match Info
        </div>
        <div className="text-base font-bold">{sarp.matchInfo.naslov}</div>
        <div className="text-xs text-muted-foreground">
          {sarp.matchInfo.liga}{sarp.matchInfo.vrijeme ? ` · početak ${sarp.matchInfo.vrijeme}` : ""}
        </div>
        {sarp.matchInfo.kvote.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sarp.matchInfo.kvote.map((k) => (
              <span key={k.kljuc} className="rounded bg-muted px-2 py-0.5 text-[11px]">
                {LABELI[k.kljuc] ?? k.label}: <b className="tabular-nums">{k.kvota != null ? k.kvota.toFixed(2) : "—"}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 2 · PREDIKCIJA (CORE) */}
      <section className="rounded-xl border border-primary/40 bg-primary/10 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
          <Target className="h-4 w-4" /> Predikcija (Core)
        </div>
        <div className="text-lg font-bold">{sarp.coreTip.label}{sarp.coreTip.kvota ? ` @ ${sarp.coreTip.kvota.toFixed(2)}` : ""}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          <span>Sigurnost: <b className="text-foreground">{fmtPct(sarp.coreTip.p)}</b></span>
          <span>Kvota: <b className="text-foreground">{sarp.coreTip.kvota?.toFixed(2) ?? "—"}</b></span>
          <span>Edge: <b className={sarp.coreTip.edge != null && sarp.coreTip.edge > 0 ? "text-emerald-400" : "text-foreground"}>
            {sarp.coreTip.edge != null ? `${(sarp.coreTip.edge * 100).toFixed(1)}%` : "—"}
          </b></span>
          <span>¼ Kelly ulog: <b className="text-foreground">{sarp.coreTip.kellyPct.toFixed(1)}%</b> banke</span>
        </div>

        {/* WHY THIS PICK? — drawer s ključnim faktorima, rizikom i slaganjem modela */}
        <button
          onClick={() => setOtvoriZasto((v) => !v)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-background/60 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-background"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {otvoriZasto ? "Sakrij analizu" : "Why this pick?"}
          <ChevronDown className={`h-3.5 w-3.5 transition ${otvoriZasto ? "rotate-180" : ""}`} />
        </button>
        {otvoriZasto && (
          <div className="mt-2 space-y-2 rounded-lg border border-border bg-background/60 p-3 text-xs">
            <div>
              <div className="font-semibold text-foreground">Ključni faktori</div>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {faktori.length > 0
                  ? faktori.map((f, i) => <li key={i}>• {f}</li>)
                  : <li>• Premalo podataka — forma/kvote nisu učitani.</li>}
              </ul>
            </div>
            <div>
              <div className="font-semibold text-foreground">Top rizik</div>
              <div className="text-amber-300">{sarp.rizici[0] ?? "Nema istaknutog rizika."}</div>
            </div>
            <div>
              <div className="font-semibold text-foreground">Slaganje modela</div>
              <div className="text-muted-foreground">
                <b className={slazu >= 2 ? "text-emerald-400" : "text-amber-400"}>{slazu} od 3</b> kvantitativna modela
                (Poisson/DC grid · Skellam · Monte Carlo) slaže se na glavnom tržištu
                {" "}(MC vs model razlika: {(mcRaz * 100).toFixed(1)}pp, suglasnost: {fmtPct(sarp.suglasnostSkellam)}).
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3 · ALTERNATIVNI TIP */}
      {sarp.altTip && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Alternativni tip (sigurnija opcija)
          </div>
          <div className="text-base font-bold">{sarp.altTip.label}{sarp.altTip.kvota ? ` @ ${sarp.altTip.kvota.toFixed(2)}` : ""}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Sigurnost {fmtPct(sarp.altTip.p)}{sarp.altTip.edge != null ? ` · edge ${(sarp.altTip.edge * 100).toFixed(1)}%` : " · bez značajnog edgea — za pokrivanje rizika, ne za value"}
          </div>
        </section>
      )}

      {/* 6 · MODEL CONFIDENCE (iznad obrazloženja, da se odmah vidi) */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="h-4 w-4 text-violet-400" /> Model Confidence
          </div>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${ocjenaKlasa(sarp.ocjena)}`}>
            {sarp.ocjena} · {sarp.povjerenje}/100
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <span>Izvora podataka: <b className="text-foreground">{sarp.brojIzvora}</b></span>
          <span>λ ukupno: <b className="text-foreground tabular-nums">{sarp.lambdaUkupno.toFixed(2)}</b></span>
          <span>Suglasnost Skellam: <b className="text-foreground">{fmtPct(sarp.suglasnostSkellam)}</b></span>
          <span>MC vs model (O2.5): <b className="text-foreground">{fmtPct(sarp.mc.o25)}</b></span>
        </div>
        {/* Brier kalibracija — pokazuje se kad ima dovoljno označenih tipova */}
        {kal.n >= 10 && kal.brier != null && kal.hitRate != null && (
          <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            Brier kalibracija (historijska točnost): {kal.n} označenih tipova · hit-rate{" "}
            <b className="text-foreground">{fmtPct(kal.hitRate)}</b> vs najavljeno{" "}
            <b className="text-foreground">{fmtPct(kal.najavljeno ?? 0)}</b> · Brier score{" "}
            <b className="text-foreground">{kal.brier.toFixed(3)}</b> (0 = savršeno, 0.25 = moneta)
            {kal.hitRate < kal.najavljeno - 0.03
              ? " — model je PRETJERANO samouvjeren: navedeni % su malo pogođeni nego što tvrde."
              : kal.hitRate > kal.najavljeno + 0.03
                ? " — model je konzervativan: pogađa više nego što najavljuje."
                : " — postoci su dobro kalibrirani."}
          </div>
        )}
      </section>

      {/* 4 · OBRAZLOŽENJE */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-amber-400" /> Obrazloženje
        </div>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {sarp.obrazlozenje.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
        <button
          onClick={() => setOtvoreneFaze((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline hover:text-foreground"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition ${otvoreneFaze ? "rotate-180" : ""}`} />
          {otvoreneFaze ? "Sakrij SARP faze" : `Prikaži svih 7 SARP faza`}
        </button>
        {otvoreneFaze && (
          <ol className="mt-2 space-y-2 border-t border-border pt-2 text-xs">
            {sarp.faze.map((f) => (
              <li key={f.broj}>
                <div className="font-semibold text-foreground">{f.broj}. {f.naziv}</div>
                <div className="text-muted-foreground">{f.sazetak}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 5 · RIZICI / UPOZORENJA */}
      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Rizici / Upozorenja
        </div>
        <ul className="space-y-1 text-xs text-amber-200/90">
          {sarp.rizici.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      </section>

      {/* 7 · LIVE KVOTE TRACKER + ODDS RADAR */}
      <section className="space-y-2">
        <OddsRadar fixtureId={utakmica.id} kljuc={sarp.coreTip.kljuc} />

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-400" /> Live Kvote Tracker</span>
            <span className="text-[10px] font-normal text-muted-foreground">{nSnimaka} snimak(a) kvota</span>
          </div>
          {kretanje.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Još samo jedan snimak kvota — otvori analizu ponovno kasnije (ili prije početka) pa se tu vidi kuda tržište kreće.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Tržište</th>
                    <th className="px-2 py-1.5 text-right">Prva</th>
                    <th className="px-2 py-1.5 text-right">Sad</th>
                    <th className="px-2 py-1.5 text-right">Δ%</th>
                    <th className="px-2 py-1.5 text-left">Tumačenje</th>
                  </tr>
                </thead>
                <tbody>
                  {kretanje.slice(0, 8).map((k) => (
                    <tr key={k.kljuc} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium">{LABELI[k.kljuc] ?? k.kljuc}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{k.prva?.toFixed(2) ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{k.zadnja?.toFixed(2) ?? "—"}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                        k.smjer === "gore" ? "text-red-400" : k.smjer === "dolje" ? "text-emerald-400" : "text-muted-foreground"
                      }`}>
                        {k.deltaPct != null ? `${k.deltaPct > 0 ? "+" : ""}${k.deltaPct}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{k.tumanenje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      {/* 8 · CLV INDIKATOR */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <LineChart className="h-4 w-4 text-indigo-400" /> CLV Indikator
        </div>
        {!clv.postoji ? (
          <p className="text-xs text-muted-foreground">
            CLV se pokazuje kad postoje barem 2 snimka kvota — prva (tvoja) vs zadnja (proxy za zatvarajuću liniju) na tržištu tvog tipa ({LABELI[clv.kljuc] ?? clv.kljuc}).
          </p>
        ) : (
          <div className="flex items-center gap-3">
            {clv.clvPct != null && clv.clvPct >= 0
              ? <TrendingUp className="h-5 w-5 text-emerald-400" />
              : <TrendingDown className="h-5 w-5 text-red-400" />}
            <div className="text-sm">
              <b className={clv.clvPct != null && clv.clvPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                CLV {clv.clvPct != null && clv.clvPct >= 0 ? "+" : ""}{clv.clvPct}%
              </b>
              <span className="text-muted-foreground">
                {" "}— uzeo {clv.kvotaUzeta?.toFixed(2)} vs zatvaranje {clv.kvotaZatvaranja?.toFixed(2)} ({LABELI[clv.kljuc] ?? clv.kljuc}).
                {clv.clvPct != null && clv.clvPct >= 0
                  ? " Dobra linija: dugoročno to je glavno mjerilo dobrog uloga."
                  : " Lošija linija od tržišta — razmisli o čekanju zadnjih minuta prije uloga."}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 9 · SIMULACIJE (MC) */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Dices className="h-4 w-4 text-fuchsia-400" /> Simulacije (Monte Carlo · {sarp.mc.n.toLocaleString("hr-HR")}×)
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {sarp.mc.topRezultati.map((t) => {
            const max = sarp.mc.topRezultati[0]?.p || 1;
            return (
              <div key={t.rezultat} className="flex items-center gap-2">
                <span className="w-10 text-sm font-bold tabular-nums">{t.rezultat}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full rounded bg-fuchsia-500/60" style={{ width: `${(t.p / max) * 100}%` }} />
                </div>
                <span className="w-14 text-right text-[11px] text-muted-foreground tabular-nums">
                  {fmtPct(t.p)} ({t.broj}×)
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded bg-muted px-2 py-0.5">BTTS {fmtPct(sarp.mc.btts)}</span>
          <span className="rounded bg-muted px-2 py-0.5">O1.5 {fmtPct(sarp.mc.o15)}</span>
          <span className="rounded bg-muted px-2 py-0.5">O2.5 {fmtPct(sarp.mc.o25)}</span>
          <span className="rounded bg-muted px-2 py-0.5">O3.5 {fmtPct(sarp.mc.o35)}</span>
          <span className="rounded bg-muted px-2 py-0.5">1 {fmtPct(sarp.mc.p1)}</span>
          <span className="rounded bg-muted px-2 py-0.5">X {fmtPct(sarp.mc.pX)}</span>
          <span className="rounded bg-muted px-2 py-0.5">2 {fmtPct(sarp.mc.p2)}</span>
        </div>
      </section>
    </div>
  );
}
