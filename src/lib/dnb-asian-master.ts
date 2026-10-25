// ============================================================
// DNB-ASIAN-MASTER.TS — SARP Brain v4.0 + Titan Protokol v10
// DNB & Sigurnice / Asian Handicap Master
// ============================================================

import { matrix } from "./zlatni-engine";

export interface SkellamProbabilities {
  pHomeWin: number;
  pDraw: number;
  pAwayWin: number;
  pHomeOrDraw: number; // 1X
  pAwayOrDraw: number; // X2
  // DNB
  pDnbHomeWin: number; // uvjetna pobjeda ako nije remi
  pDnbAwayWin: number;
  pushRate: number; // šansa remija (povrat uloga)
  // Azijski hendikepi
  pAhHomePlus025: number; // Win + Half Win on Draw
  pAhAwayPlus025: number;
  pAhHomeMinus025: number;
  pAhAwayMinus025: number;
}

export interface DnbAsianPick {
  id: string;
  fixtureId: number;
  match: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  time: string;
  marketType: "DNB" | "AH_+0.5" | "AH_+0.25" | "AH_-0.25" | "AH_-0.5";
  selection: string;
  line: string;
  trueProbability: number; // 0..1 (>= 78% za Master selekcije)
  pushRate: number;        // šansa za kvotu 1.00
  fairOdd: number;
  bookieOdd: number;
  evPercent: number;
  isBankrollBuilder: boolean; // Anchor leg za 30-match slip
  reasoning: string;
}

export function calculateSkellam(lh: number, la: number): SkellamProbabilities {
  const m = matrix(lh, la, true);
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;

  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = m[i]?.[j] ?? 0;
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
    }
  }

  const decisive = Math.max(0.001, pHome + pAway);
  const pDnbHomeWin = pHome / decisive;
  const pDnbAwayWin = pAway / decisive;

  return {
    pHomeWin: Number(pHome.toFixed(4)),
    pDraw: Number(pDraw.toFixed(4)),
    pAwayWin: Number(pAway.toFixed(4)),
    pHomeOrDraw: Number((pHome + pDraw).toFixed(4)),
    pAwayOrDraw: Number((pAway + pDraw).toFixed(4)),
    pDnbHomeWin: Number(pDnbHomeWin.toFixed(4)),
    pDnbAwayWin: Number(pDnbAwayWin.toFixed(4)),
    pushRate: Number(pDraw.toFixed(4)),
    pAhHomePlus025: Number((pHome + pDraw * 0.75).toFixed(4)),
    pAhAwayPlus025: Number((pAway + pDraw * 0.75).toFixed(4)),
    pAhHomeMinus025: Number((pHome * 0.95).toFixed(4)),
    pAhAwayMinus025: Number((pAway * 0.95).toFixed(4)),
  };
}

export function generateDnbAsianPicks(fixtures: Array<{
  id: number;
  home: string;
  away: string;
  league: string;
  time: string;
  lh: number;
  la: number;
  bookieOdds?: {
    dnbHome?: number;
    dnbAway?: number;
    homeOrDraw?: number;
    awayOrDraw?: number;
  };
}>): DnbAsianPick[] {
  const picks: DnbAsianPick[] = [];

  for (const f of fixtures) {
    const sk = calculateSkellam(f.lh, f.la);

    // 1. DNB Domaćin (ako je favorit s push zaštitom)
    const homeSafety = sk.pHomeOrDraw;
    if (homeSafety >= 0.78) {
      const bookieOdd = f.bookieOdds?.dnbHome ?? Number((1 / Math.max(0.05, sk.pDnbHomeWin * 0.92)).toFixed(2));
      const fairOdd = Number((1 / Math.max(0.05, sk.pDnbHomeWin)).toFixed(2));
      const ev = Number(((sk.pDnbHomeWin * bookieOdd - 1) * 100).toFixed(1));

      picks.push({
        id: `${f.id}-dnb-1`,
        fixtureId: f.id,
        match: `${f.home} - ${f.away}`,
        homeTeam: f.home,
        awayTeam: f.away,
        league: f.league,
        time: f.time,
        marketType: "DNB",
        selection: `1 DNB (${f.home})`,
        line: "DNB (Remi = Kvota 1.00)",
        trueProbability: homeSafety,
        pushRate: sk.pushRate,
        fairOdd,
        bookieOdd,
        evPercent: ev,
        isBankrollBuilder: homeSafety >= 0.82,
        reasoning: `Skellam model: ${Math.round(sk.pHomeWin * 100)}% pobjeda, ${Math.round(sk.pushRate * 100)}% remi povrat. Ukupna sigurnost od poraza: ${Math.round(homeSafety * 100)}%.`,
      });
    }

    // 2. DNB Gost (ako je gost izraziti favorit)
    const awaySafety = sk.pAwayOrDraw;
    if (awaySafety >= 0.78) {
      const bookieOdd = f.bookieOdds?.dnbAway ?? Number((1 / Math.max(0.05, sk.pDnbAwayWin * 0.92)).toFixed(2));
      const fairOdd = Number((1 / Math.max(0.05, sk.pDnbAwayWin)).toFixed(2));
      const ev = Number(((sk.pDnbAwayWin * bookieOdd - 1) * 100).toFixed(1));

      picks.push({
        id: `${f.id}-dnb-2`,
        fixtureId: f.id,
        match: `${f.home} - ${f.away}`,
        homeTeam: f.home,
        awayTeam: f.away,
        league: f.league,
        time: f.time,
        marketType: "DNB",
        selection: `2 DNB (${f.away})`,
        line: "DNB (Remi = Kvota 1.00)",
        trueProbability: awaySafety,
        pushRate: sk.pushRate,
        fairOdd,
        bookieOdd,
        evPercent: ev,
        isBankrollBuilder: awaySafety >= 0.82,
        reasoning: `Skellam model: ${Math.round(sk.pAwayWin * 100)}% pobjeda, ${Math.round(sk.pushRate * 100)}% remi povrat. Ukupna sigurnost od poraza: ${Math.round(awaySafety * 100)}%.`,
      });
    }

    // 3. Azijski hendikep +0.5 / Dvostruka šansa (1X ili X2 iznad 80%)
    if (sk.pHomeOrDraw >= 0.80) {
      const bookieOdd = f.bookieOdds?.homeOrDraw ?? Number((1 / Math.max(0.05, sk.pHomeOrDraw * 0.93)).toFixed(2));
      picks.push({
        id: `${f.id}-ah-plus05-1`,
        fixtureId: f.id,
        match: `${f.home} - ${f.away}`,
        homeTeam: f.home,
        awayTeam: f.away,
        league: f.league,
        time: f.time,
        marketType: "AH_+0.5",
        selection: `${f.home} +0.5 (1X)`,
        line: "AH +0.5 (Dvostruka šansa)",
        trueProbability: sk.pHomeOrDraw,
        pushRate: 0,
        fairOdd: Number((1 / sk.pHomeOrDraw).toFixed(2)),
        bookieOdd,
        evPercent: Number(((sk.pHomeOrDraw * bookieOdd - 1) * 100).toFixed(1)),
        isBankrollBuilder: true,
        reasoning: `Klasični bankroll builder s ${(sk.pHomeOrDraw * 100).toFixed(1)}% matematičke vjerojatnosti nepobjedivosti domaćina.`,
      });
    } else if (sk.pAwayOrDraw >= 0.80) {
      const bookieOdd = f.bookieOdds?.awayOrDraw ?? Number((1 / Math.max(0.05, sk.pAwayOrDraw * 0.93)).toFixed(2));
      picks.push({
        id: `${f.id}-ah-plus05-2`,
        fixtureId: f.id,
        match: `${f.home} - ${f.away}`,
        homeTeam: f.home,
        awayTeam: f.away,
        league: f.league,
        time: f.time,
        marketType: "AH_+0.5",
        selection: `${f.away} +0.5 (X2)`,
        line: "AH +0.5 (Dvostruka šansa)",
        trueProbability: sk.pAwayOrDraw,
        pushRate: 0,
        fairOdd: Number((1 / sk.pAwayOrDraw).toFixed(2)),
        bookieOdd,
        evPercent: Number(((sk.pAwayOrDraw * bookieOdd - 1) * 100).toFixed(1)),
        isBankrollBuilder: true,
        reasoning: `Klasični bankroll builder s ${(sk.pAwayOrDraw * 100).toFixed(1)}% matematičke vjerojatnosti nepobjedivosti gosta.`,
      });
    }
  }

  // Sortiraj po pravoj vjerojatnosti silazno
  return picks.sort((a, b) => b.trueProbability - a.trueProbability);
}
