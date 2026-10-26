import { useMemo } from "react";
import { htftNogomet } from "@/lib/htft-motor";

/* ═══════════════════════════════════════════════════════════════════
   HTFTProPanel — nogometna HT/FT nadogradnja (Pro sloj)
   ═══════════════════════════════════════════════════════════════════
   Dodaje na HT/FT Beta karticu:
     • točna Poisson distribucija golova u 1. poluvremenu (0/1/2/3+)
     • TOP 3 prijelazna stanja s EV indikatorima (ako su kvote dane)
     • REVERSE RISK indikator — vjerojatnost potpunog preokreta
       (1/2 i 2/1) s razinom: nisko / srednje / visoko
   ═══════════════════════════════════════════════════════════════════ */

type Props = {
  lamH: number;   // očekivani golovi domaćin (cijela utakmica)
  lamA: number;   // očekivani golovi gost (cijela utakmica)
  /** kvote knjižare za 9 HT/FT kodova ("1/1" ... "2/2") — za EV */
  kvote9?: Record<string, number> | null;
};

export default function HTFTProPanel({ lamH, lamA, kvote9 }: Props) {
  const a = useMemo(() => htftNogomet(lamH, lamA), [lamH, lamA]);

  const htRedovi: { label: string; p: number }[] = [
    { label: "0 golova", p: a.htGolovi.nula },
    { label: "1 gol", p: a.htGolovi.jedan },
    { label: "2 gola", p: a.htGolovi.dva },
    { label: "3+", p: a.htGolovi.triPlus },
  ];
  const maxHt = Math.max(...htRedovi.map((r) => r.p));

  const razinaBoja =
    a.razinaPreokreta === "visoko"
      ? "bg-red-500/15 text-red-300 border-red-500/40"
      : a.razinaPreokreta === "srednje"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";

  const ev = (kod: string, p: number): number | null => {
    const o = kvote9?.[kod];
    return o && o > 1 ? p * o - 1 : null;
  };

  return (
    <section className="rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-indigo-200 tracking-wide">
          ⚡ HT/FT PRO — Bivarijantni prijelazni model (λ₁p = 0.44 · λ)
        </h3>
        <span className="text-[11px] text-indigo-300/70">
          2p. dinamika: tlači ×1.25 · drži ×0.90
        </span>
      </div>

      {/* Golovi u 1. poluvremenu */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
          Očekivano 1. poluvrijeme: <span className="text-indigo-300 font-bold">{a.lamHT.toFixed(2)}</span> gola
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {htRedovi.map((r) => (
            <div key={r.label} className="rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-slate-300">{r.label}</span>
                <span className="text-sm font-bold text-indigo-200">{(r.p * 100).toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400"
                  style={{ width: `${(r.p / maxHt) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TOP 3 stanja s EV */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Top 3 prijelazna stanja</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {a.top3.map((t, i) => {
            const e = ev(t.kod, t.p);
            const dobar = e !== null && e > 0;
            return (
              <div key={t.kod} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">#{i + 1}</span>
                  <span className="text-lg font-extrabold text-white">{t.kod}</span>
                </div>
                <p className="mt-1 text-center text-2xl font-black text-indigo-300">{(t.p * 100).toFixed(1)}%</p>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">fer {t.ferOdd.toFixed(1)}</span>
                  {e !== null ? (
                    <span className={dobar ? "font-bold text-emerald-400" : "font-bold text-rose-400"}>
                      EV {(e * 100 >= 0 ? "+" : "") + (e * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-500">bez kvote</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reverse Risk */}
      <div className={`rounded-xl border p-3 ${razinaBoja}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold tracking-wide">REVERSE RISK — preokreti (1/2 + 2/1)</span>
          <span className="text-sm font-black">{(a.preokreti * 100).toFixed(1)}%</span>
        </div>
        <div className="mt-1 flex gap-4 text-[11px] opacity-80">
          <span>1/2: {(a.preokret12 * 100).toFixed(1)}%</span>
          <span>2/1: {(a.preokret21 * 100).toFixed(1)}%</span>
          <span className="ml-auto uppercase font-semibold">{a.razinaPreokreta}</span>
        </div>
      </div>
    </section>
  );
}

