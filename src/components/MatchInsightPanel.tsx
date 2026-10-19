/* ═══════════════════════════════════════════════════════════════════
   MATCH INSIGHT PANEL — profesionalna analiza u 9 sekcija
   ═══════════════════════════════════════════════════════════════════
   1. Match Info        — timovi, liga, vrijeme, kvote (1X2, GG/NG, O2.5)
   2. Predikcija Core   — glavni tip: sigurnost %, kvota, edge, ¼ Kelly
   3. Alternativni tip  — sigurnija opcija ako glavni nije dovoljno siguran
   4. Obrazloženje      — 3–6 rečenica (SARP faze, parametri, faktori)
   5. Rizici/Upozorenja — kadrovi, motivacija, crveni karton scenariji
   6. Model Confidence  — A/B/C ocjena + broj izvora podataka
   7. Live Kvote Tracker— kretanje kvota: u tvoju korist ili protiv
   8. CLV Indikator     — bolju li kvotu si uzeo od zatvarajuće linije
   9. Simulacije MC     — najčešći rezultati iz 10.000 simulacija

   Panel radi sam: prima utakmicu + kvote + goals-analizu, interni
   poziva SARP (7 faza), vodi historiju kvota i Monte Carlo.
   ═══════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BookOpen, BrainCircuit, ChevronDown,
  Dices, Info, LineChart, ShieldCheck, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { sarpBrain, type SarpIzlaz } from "@/lib/sarp-brain";
import {
  clvZaTip, kretanjeKvota, spremiSnapshot, snapshoti,
  type KretanjeKvote,
} from "@/lib/odds-tracker";
import type { GoalsIzlaz } from "@/lib/goals-motor";
import type { FormaGolovi } from "@/lib/math-engine";

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

  const sarp: SarpIzlaz = useMemo(
    () =>
      sarpBrain({
        utakmica,
        kvote,
        brojKladionica: props.brojKladionica,
        formaDom: props.formaDom ?? null,
        formaGost: props.formaGost ?? null,
        goals: goals ?? null,
      }),
    [utakmica, kvote, props.brojKladionica, props.formaDom, props.formaGost, goals],
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

  return (
    <div className="space-y-3">
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

      {/* 7 · LIVE KVOTE TRACKER */}
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
