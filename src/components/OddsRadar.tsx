/* ═══════════════════════════════════════════════════════════════════
   ODDS RADAR — Smart Money Alert (kretanje kvota u tvoju korist/protiv)
   ═══════════════════════════════════════════════════════════════════
   Čita postojeći odds-tracker (localStorage snimci kvota) i za
   ključ tvog tipa pokazuje:

     • kvota PADALA ≥ 3% → "SHARP DRIFT CONFIRMED" — pametni novac
       ide u tvoju korist, linija se kreće prema tvojoj predikciji;
     • kvota RASTELA ≥ 3% → "ODDS DRIFT WARNING — REDUCE STAKE";
     • manje od 2 snimka → poruka da se analiza otvori i kasnije.

   Read-only: ništa ne snima (to radi kartica preko spremiSnapshot).
   ═══════════════════════════════════════════════════════════════════ */

import { useMemo } from "react";
import { Radar, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { snapshoti } from "@/lib/odds-tracker";

export type SmartMoney = {
  postoji: boolean;
  verdict: "sharp" | "protiv" | "mirovanje" | "nema";
  naslov: string;
  tekst: string;
  deltaPct: number | null;
};

/** Verdict pametnog novca za dani ključ tipa (npr. "bttsDa", "o25", "1"). */
export function smartMoneyVerdict(fixtureId: number, kljuc: string): SmartMoney {
  const s = snapshoti(fixtureId);
  if (s.length < 2) {
    return {
      postoji: false,
      verdict: "nema",
      naslov: "Smart Money Alert",
      tekst:
        "Nedovoljno snimaka kvota. Otvori analizu ponovno kasnije (i prije početka utakmice) — radar prati kuda tržište kreće.",
      deltaPct: null,
    };
  }
  const prva = s[0]!.kvote[kljuc];
  const zadnja = s[s.length - 1]!.kvote[kljuc];
  if (prva == null || zadnja == null || prva <= 0) {
    return {
      postoji: false,
      verdict: "nema",
      naslov: "Smart Money Alert",
      tekst: "Nema povijesti kvota na ovom tržištu.",
      deltaPct: null,
    };
  }
  const deltaPct = Math.round((zadnja / prva - 1) * 1000) / 10;

  if (deltaPct <= -3) {
    return {
      postoji: true,
      verdict: "sharp",
      naslov: "SHARP DRIFT CONFIRMED",
      tekst: `Kvota na tvom tipu je pala ${Math.abs(deltaPct)}% (${prva.toFixed(2)} → ${zadnja.toFixed(2)}). Pametni novac ide U TVOJU KORIST — tržište se kreće prema tvojoj predikciji.`,
      deltaPct,
    };
  }
  if (deltaPct >= 3) {
    return {
      postoji: true,
      verdict: "protiv",
      naslov: "ODDS DRIFT WARNING — REDUCE STAKE",
      tekst: `Kvota na tvom tipu raste ${deltaPct}% (${prva.toFixed(2)} → ${zadnja.toFixed(2)}). Tržište drifta PROTIV tvoje predikcije — smanji ulog ili razmisli o pasu.`,
      deltaPct,
    };
  }
  return {
    postoji: true,
    verdict: "mirovanje",
    naslov: "Tržište miruje",
    tekst: `Kvota se mijenja manje od 3% (${prva.toFixed(2)} → ${zadnja.toFixed(2)}). Nema jakog signala pametnog novca u nikom smjeru.`,
    deltaPct,
  };
}

export function OddsRadar({ fixtureId, kljuc }: { fixtureId: number; kljuc: string }) {
  const sm = useMemo(() => smartMoneyVerdict(fixtureId, kljuc), [fixtureId, kljuc]);

  const stil =
    sm.verdict === "sharp"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : sm.verdict === "protiv"
        ? "border-red-500/40 bg-red-500/10 text-red-300"
        : "border-border bg-card text-foreground";

  return (
    <div className={`rounded-xl border p-4 ${stil}`}>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Radar className="h-4 w-4" /> Odds Radar — Smart Money
        {sm.verdict === "sharp" && <TrendingUp className="h-4 w-4" />}
        {sm.verdict === "protiv" && <TrendingDown className="h-4 w-4" />}
        {sm.verdict === "mirovanje" && <Waves className="h-4 w-4" />}
      </div>
      <div className="text-sm font-bold">{sm.naslov}</div>
      <p className="mt-0.5 text-xs opacity-90">{sm.tekst}</p>
    </div>
  );
}
