// ============================================================
// SARPSPORTPANEL.TSX — SARP ploča za Košarku i Rukomet Sharp
// Prikazuje: badgeove (Pace/Fatigue/GK/Rizik remija), projekcije
// s podjelama (1H/1Q ili 1H+HT/FT), trostruku verifikaciju
// (Model vs Monte Carlo vs De-vig tržište), core/alt tip s
// edge guardom (EV ≥ 4.5%) i ¼ Kelly ulogom, povjerenje A/B/C
// s brojem izvora. "+ Korpa" šalje tip u Bet Slip i Dnevnik.
// v2: broj kladionica iz API odgovora ide u globalnu kalibraciju motora.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Brain, CheckCircle2, Flame, Gauge, ShieldCheck, ShoppingCart } from "lucide-react";
import { sarpKosarka, type BasketballMatchStats, type BasketballSARPPrediction } from "@/lib/sarp-kosarka";
import { sarpRukomet, type HandballMatchStats, type HandballSARPPrediction } from "@/lib/sarp-rukomet";
import type { KosMarkets } from "@/lib/kosarka.functions";
import type { KosAnalysis } from "@/lib/kosarka-engine";
import type { RukometAnalysis } from "@/lib/rukomet-engine";
import { dodajUKorpu } from "@/lib/korpa";
import { htftKosarka, htftRukomet, type HtFtKosarkaIzlaz, type HtFtRukometIzlaz } from "@/lib/htft-motor";
import { losaCijena } from "@/lib/devig-shield";
import { zapisiTip } from "@/lib/dnevnik";
import { spremiKontekstMeca } from "@/lib/ai-context";

type Utakmica = { id: number; home: string; away: string; league: string; time: string };

type Props =
  | { sport: "kosarka"; utakmica: Utakmica; an: KosAnalysis; mk: KosMarkets | null; book: string | null; brojKladionica?: number | null }
  | { sport: "rukomet"; utakmica: Utakmica; an: RukometAnalysis; book: string | null; brojKladionica?: number | null };

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function Badge({ label, value, dobar }: { label: string; value: string; dobar?: boolean | null }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs font-semibold ${dobar === true ? "text-emerald-400" : dobar === false ? "text-amber-400" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
