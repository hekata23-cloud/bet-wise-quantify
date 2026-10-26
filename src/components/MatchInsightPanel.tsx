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
  Activity,
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Dices,
  Info,
  LineChart,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Ban,
  HelpCircle,
} from "lucide-react";
import { sarpBrain, type SarpIzlaz } from "@/lib/sarp-brain";
import {
  clvZaTip,
  kretanjeKvota,
  spremiSnapshot,
  snapshoti,
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

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

const LABELI: Record<string, string> = {
  "1": "1 · domaćin",
  X: "X · neriješeno",
  "2": "2 · gost",
  bttsDa: "GG — da",
  bttsNe: "NG — ne",
  o15: "O1.5",
  u15: "U1.5",
  o25: "O2.5",
  u25: "U2.5",
  o35: "O3.5",
  u35: "U3.5",
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

  // UNIVERSAL MATCH CONTEXT (v7): normalizirani kontekst utakmice
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
    [
      utakmica.id,
      utakmica.home,
      utakmica.away,
      utakmica.league,
      okolisUlaz,
      sudacUlaz,
      props.brojKladionica,
    ],
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
    [
      utakmica,
      kvote,
      props.brojKladionica,
      props.formaDom,
      props.formaGost,
      goals,
      okolisUlaz,
      sudacUlaz,
      universalKontekst,
    ],
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
      liga: sarp.matchInfo.liga ?? undefined,
      vrijeme: sarp.matchInfo.vrijeme ?? undefined,
      kvote,
      lambdaDom: sarp.lambdaDom,
      lambdaGost: sarp.lambdaGost,
      lambdaUkupno: sarp.lambdaUkupno,
      konsenzus: sarp.konsenzus,
      coreTip: {
        label: sarp.coreTip.label,
        kljuc: sarp.coreTip.kljuc,
        p: sarp.coreTip.p,
        kvota: sarp.coreTip.kvota ?? undefined,
        edge: sarp.coreTip.edge,
        kellyPct: sarp.coreTip.kellyPct,
      },
      altTip: sarp.altTip
        ? {
            label: sarp.altTip.label,
            p: sarp.altTip.p,
            kvota: sarp.altTip.kvota ?? undefined,
          }
        : null,
      mc: {
        btts: sarp.mc.btts,
        o15: sarp.mc.o15,
        o25: sarp.mc.o25,
        o35: sarp.mc.o35,
        p1: sarp.mc.p1,
        pX: sarp.mc.pX,
        p2: sarp.mc.p2,
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

  /* ── ANTI-LOSS ENGINE ── */
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
  const slazu = 1 + (sarp.suglasnostSkellam >= 0.85 ? 1 : 0) + (mcRaz <= 0.05 ? 1 : 0);

  /* ── BRIER KALIBRACIJA ── */
  const kal = brierKalibracija();

  return (
    <div className="space-y-4">
      {/* 0 · ANTI-LOSS FILTER (ako je oklada rizična, stavi crvenu traku na sam vrh) */}
      {antiLoss.akcija === "SKIP" && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          <Ban className="h-5 w-5 shrink-0 text-red-400" />
          <div className="flex-1">
            <b>ANTI-LOSS FILTER: PREPORUKA JE PRESKOČITI OVU UTAKMICU</b>
            <div className="text-xs text-red-200/80">Razlog: {antiLoss.razlozi.join(" · ")}</div>
          </div>
        </div>
      )}

      {antiLoss.akcija === "HIGH_VOLATILITY" && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="flex-1">
            <b>POVEĆANA VOLATILNOST TRŽIŠTA</b>
            <div className="text-xs text-amber-200/80">
              {antiLoss.razlozi.join(" · ")} — preporučeni ulog je automatski prepolovljen.
            </div>
          </div>
        </div>
      )}

      {antiLoss.akcija === "GOLD" && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
          <div className="flex-1">
            <b>ZLATNA PRILIKA (EDGE ≥ 5%)</b>
            <div className="text-xs text-emerald-200/80">
              Model i tržište se slažu, a prednost nad kladionicom je visoka (
              {fmtPct(sarp.coreTip.edge)}).
            </div>
          </div>
        </div>
      )}

      {/* 1 · MATCH INFO */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">{sarp.matchInfo.naslov}</h3>
            <p className="text-xs text-muted-foreground">
              {sarp.matchInfo.liga} {sarp.matchInfo.vrijeme ? `· ${sarp.matchInfo.vrijeme}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${ocjenaKlasa(sarp.ocjena)}`}
            >
              Ocjena {sarp.ocjena} ({sarp.povjerenje}/100)
            </span>
          </div>
        </div>

        {/* Tržišne kvote */}
        {Object.keys(sarp.matchInfo.kvote).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="text-muted-foreground self-center">Kvote:</span>
            {Object.entries(sarp.matchInfo.kvote).map(([k, v]) => (
              <span key={k} className="rounded bg-muted px-2 py-0.5 font-mono">
                <span className="text-muted-foreground">{LABELI[k] ?? k}:</span>{" "}
                <b>{v.toFixed(2)}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 1b · LINEUP RADAR (v3) */}
      <LineupRadar
        domacin={utakmica.home}
        gost={utakmica.away}
        liga={utakmica.league}
        onLineupPromjena={setLineupInfo}
      />

      {/* 2 · PREDIKCIJA (CORE + EV + ¼ KELLY) */}
      <section className="rounded-xl border-2 border-primary/40 bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Target className="h-4 w-4" /> SARP Core Predikcija (Glavni tip)
          </div>
          <span className="text-xs text-muted-foreground">{slazu}/3 modela se slažu</span>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <div className="text-2xl font-black text-foreground">{sarp.coreTip.label}</div>
            <div className="text-xs text-muted-foreground">
              Vjerojatnost modela: <b className="text-foreground">{fmtPct(sarp.coreTip.p)}</b>
              {sarp.coreTip.kvota && (
                <>
                  {" "}
                  · Tržišna kvota:{" "}
                  <b className="text-foreground">{sarp.coreTip.kvota.toFixed(2)}</b>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-lg font-bold ${sarp.coreTip.edge >= 0 ? "text-emerald-400" : "text-muted-foreground"}`}
            >
              {sarp.coreTip.edge >= 0 ? `+${fmtPct(sarp.coreTip.edge)}` : fmtPct(sarp.coreTip.edge)}{" "}
              EV
            </div>
            <div className="text-xs text-muted-foreground">
              ¼ Kelly ulog: <b className="text-foreground">{sarp.coreTip.kellyPct}%</b> banke
            </div>
          </div>
        </div>

        {/* Why this pick? Drawer gumb */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <button
            onClick={() => setOtvoriZasto((v) => !v)}
            className="flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <HelpCircle className="h-3.5 w-3.5" /> Zašto baš ovaj tip? (SARP sažetak)
          </button>
          <span className="text-[11px] text-muted-foreground">
            {sarp.coreTip.edge >= 0.05 ? "Preporučeno: visok edge" : "Umjerena prednost"}
          </span>
        </div>

        {otvoriZasto && (
          <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5 border border-border/50">
            <div>
              • <b>Poisson & Skellam:</b> λ dom = {sarp.lambdaDom.toFixed(2)}, λ gost ={" "}
              {sarp.lambdaGost.toFixed(2)} (ukupno {sarp.lambdaUkupno.toFixed(2)}).
            </div>
            <div>
              • <b>Konsenzus:</b> {sarp.brojIzvora} neovisnih izvora podataka sintetizirano u 1
              projekciju.
            </div>
            <div>
              • <b>Monte Carlo:</b> {sarp.mc.n.toLocaleString("hr-HR")} simulacija potvrđuje
              stabilnost vjerojatnosti.
            </div>
            {lineupInfo?.utjecaj?.imaUtjecaj && (
              <div>
                • <b>Lineup utjecaj:</b> detektirana promjena sastava pomiče distribuciju za{" "}
                {lineupInfo.utjecaj.procenat}%.
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3 · ALTERNATIVNI TIP */}
      {sarp.altTip && (
        <section className="rounded-xl border border-border bg-card/60 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Alternativni (sigurniji) tip:</span>
            <span className="font-bold text-foreground">
              {sarp.altTip.label} · {fmtPct(sarp.altTip.p)}
              {sarp.altTip.kvota ? ` @ ${sarp.altTip.kvota.toFixed(2)}` : ""}
            </span>
          </div>
        </section>
      )}

      {/* SGP BUILDER (v3) */}
      <SgpBuilder
        utakmicaId={utakmica.id}
        lambdaDom={sarp.lambdaDom}
        lambdaGost={sarp.lambdaGost}
        konsenzus={sarp.konsenzus}
        kvoteTrzista={kvote}
      />

      {/* LIVE ENGINE (v3) */}
      <LiveMotorPanel
        domacin={utakmica.home}
        gost={utakmica.away}
        lambdaDomPocetni={sarp.lambdaDom}
        lambdaGostPocetni={sarp.lambdaGost}
      />

      {/* 5 · RIZICI I UPOZORENJA */}
      {sarp.rizici.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Rizici i upozorenja modela
          </div>
          <ul className="space-y-1 text-xs text-amber-200/90">
            {sarp.rizici.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 6 · MODEL CONFIDENCE */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="h-4 w-4 text-violet-400" /> Model Confidence
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${ocjenaKlasa(sarp.ocjena)}`}
          >
            {sarp.ocjena} · {sarp.povjerenje}/100
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <span>
            Izvora podataka: <b className="text-foreground">{sarp.brojIzvora}</b>
          </span>
          <span>
            λ ukupno: <b className="text-foreground tabular-nums">{sarp.lambdaUkupno.toFixed(2)}</b>
          </span>
          <span>
            Suglasnost Skellam: <b className="text-foreground">{fmtPct(sarp.suglasnostSkellam)}</b>
          </span>
          <span>
            MC vs model (O2.5): <b className="text-foreground">{fmtPct(sarp.mc.o25)}</b>
          </span>
        </div>
        {/* Brier kalibracija — pokazuje se kad ima dovoljno označenih tipova */}
        {kal.n >= 10 && kal.brier != null && kal.hitRate != null && kal.najavljeno != null && (
          <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            Brier kalibracija (historijska točnost): {kal.n} označenih tipova · hit-rate{" "}
            <b className="text-foreground">{fmtPct(kal.hitRate)}</b> vs najavljeno{" "}
            <b className="text-foreground">{fmtPct(kal.najavljeno)}</b> · Brier score{" "}
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
          {sarp.obrazlozenje.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>

        {/* Detalji 7 faza (harmonika) */}
        <button
          onClick={() => setOtvoreneFaze((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${otvoreneFaze ? "rotate-180" : ""}`}
          />
          {otvoreneFaze ? "Sakrij SARP faza detalje" : "Prikaži detalje svih 7 SARP faza"}
        </button>

        {otvoreneFaze && (
          <div className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {sarp.faze.map((f) => (
              <div key={f.faza} className="rounded-lg bg-muted/30 p-2.5">
                <div className="font-semibold text-foreground">
                  Faza {f.faza}: {f.naziv}
                </div>
                <div>{f.sazetak}</div>
                {f.detalji && <div className="text-[11px] opacity-75">{f.detalji}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 7 · LIVE KVOTE TRACKER */}
      <section className="space-y-3">
        <OddsRadar kretanje={kretanje} />

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-sky-400" /> Live Kvote Tracker (Smart Money)
            </div>
            <span className="text-xs text-muted-foreground">
              {nSnimaka} {nSnimaka === 1 ? "snimak" : "snimaka"} u memoriji
            </span>
          </div>

          {kretanje.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Još nema historije kvota za ovu utakmicu. Kako osvježavaš kvote, ovdje će se pratiti
              kretanje linija.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="pb-1">Ishod</th>
                    <th className="pb-1 text-right">Otvoreno</th>
                    <th className="pb-1 text-right">Zadnje</th>
                    <th className="pb-1 text-right">Promjena</th>
                    <th className="pb-1">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {kretanje.map((k) => (
                    <tr key={k.kljuc} className="border-b border-border/30">
                      <td className="py-1.5 font-bold">{LABELI[k.kljuc] ?? k.kljuc}</td>
                      <td className="py-1.5 text-right font-mono">
                        {k.otvaranje?.toFixed(2) ?? "—"}
                      </td>
                      <td className="py-1.5 text-right font-mono font-bold text-foreground">
                        {k.zadnja?.toFixed(2) ?? "—"}
                      </td>
                      <td
                        className={`py-1.5 text-right font-mono font-bold ${
                          k.deltaPct == null
                            ? "text-muted-foreground"
                            : k.deltaPct > 0
                              ? "text-emerald-400"
                              : k.deltaPct < 0
                                ? "text-red-400"
                                : "text-muted-foreground"
                        }`}
                      >
                        {k.deltaPct != null ? `${k.deltaPct > 0 ? "+" : ""}${k.deltaPct}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                        {k.tumanenje}
                      </td>
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
            CLV se pokazuje kad postoje barem 2 snimka kvota — prva (tvoja) vs zadnja (proxy za
            zatvarajuću liniju) na tržištu tvog tipa ({LABELI[clv.kljuc] ?? clv.kljuc}).
          </p>
        ) : (
          <div className="flex items-center gap-3">
            {clv.clvPct != null && clv.clvPct >= 0 ? (
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-400" />
            )}
            <div className="text-sm">
              <b
                className={
                  clv.clvPct != null && clv.clvPct >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                CLV {clv.clvPct != null && clv.clvPct >= 0 ? "+" : ""}
                {clv.clvPct}%
              </b>
              <span className="text-muted-foreground">
                {" "}
                — uzeo {clv.kvotaUzeta?.toFixed(2)} vs zatvaranje {clv.kvotaZatvaranja?.toFixed(2)}{" "}
                ({LABELI[clv.kljuc] ?? clv.kljuc}).
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
          <Dices className="h-4 w-4 text-fuchsia-400" /> Simulacije (Monte Carlo ·{" "}
          {sarp.mc.n.toLocaleString("hr-HR")}×)
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {sarp.mc.topRezultati.map((t) => {
            const max = sarp.mc.topRezultati[0]?.p || 1;
            return (
              <div key={t.rezultat} className="flex items-center gap-2">
                <span className="w-10 text-sm font-bold tabular-nums">{t.rezultat}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-fuchsia-500/60"
                    style={{ width: `${(t.p / max) * 100}%` }}
                  />
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
