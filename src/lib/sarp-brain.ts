/* ═══════════════════════════════════════════════════════════════════
   SARP BRAIN — profesionalna 7-fazna analiza utakmice
   ═══════════════════════════════════════════════════════════════════
   SARP = Skup → Struktura → Tržište → Model → Fuzija → Monte Carlo → Odluka

   Faza 1  SKUP:      inventar podataka (kvote, forme, broj kladionica)
   Faza 2  STRUKTURA: forma → λ domaćin/gost (multiplikativni DC stil)
   Faza 3  TRŽIŠTE:   de-marginirane implicitne vjerojatnosti
   Faza 4  MODEL:     Poisson + Dixon-Coles grid + Skellam provjera 1X2
   Faza 5  FUZIJA:    konsenzus modela i goals-motora (ako postoji)
   Faza 6  MONTE CARLO: 10.000 simulacija iz fuzionirane matrice
   Faza 7  ODLUKA:    glavni tip, alternativni tip, rizici, obrazloženje,
                      ocjena povjerenja A/B/C i broj izvora podataka

   Bez API poziva — čisti proračun nad podacima koje kartica već ima.
   ═══════════════════════════════════════════════════════════════════ */

import {
  clamp,
  deMargin2,
  deMargin3,
  izgradiGrid,
  lambdaIzForme,
  kellyUlogPct,
  metrikeIzGrida,
  monteCarlo,
  skellam1x2,
  okolisPomak,
  sudacProfil,
  type FormaGolovi,
  type McIzlaz,
  type OkolisIzlaz,
  type OkolisUlaz,
  type SudacIzlaz,
  type SudacUlaz,
} from "./math-engine";
import { HAZARD_BETA, ahSkellam } from "./skellam";
import type { GoalsIzlaz } from "./goals-motor";
import { kvota as cistaKvota, broj, type UniversalMatchContext } from "./safe-math";

export type SarpTip = {
  kljuc: string;
  label: string;
  p: number;
  kvota: number | null;
  edge: number | null;
  kellyPct: number;
  izvor: "konsenzus" | "model";
};

export type SarpFaza = {
  broj: number;
  naziv: string;
  sazetak: string;
  podaci: string[];
};

export type SarpUlaz = {
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
  /** izlaz goals-motora (BTTS Ultra / 2.5 Pro) ako postoji — fuzionira se */
  goals?: GoalsIzlaz | null;
  /** OKOLIS (v6): vjetar/kiša/teren — opcionalno, identitet bez podataka */
  okolis?: OkolisUlaz | null;
  /** SUDAC (v6): prosjek kartona/penala suca — opcionalno */
  sudac?: SudacUlaz | null;
  /** UNIVERSAL MATCH CONTEXT (v7): normalizirani kontekst utakmice iz
   *  safe-math (xG, motivacija, vjetar/kiša, sudac, kladionice). Opcionalno
   *  — bez njega motor radi kao i do sada (identitet). */
  kontekst?: UniversalMatchContext | null;
};

export type SarpIzlaz = {
  faze: SarpFaza[];
  matchInfo: {
    naslov: string;
    liga: string;
    vrijeme: string | null;
    kvote: { kljuc: string; label: string; kvota: number | null }[];
  };
  coreTip: SarpTip;
  altTip: SarpTip | null;
  obrazlozenje: string[];
  rizici: string[];
  ocjena: "A" | "B" | "C";
  povjerenje: number; // 0..100
  brojIzvora: number;
  lambdaDom: number;
  lambdaGost: number;
  lambdaUkupno: number;
  konsenzus: Record<string, number>;
  mc: McIzlaz;
  suglasnostSkellam: number; // 0..1 koliko se model i Skellam slažu
  /** KVANT NADGRADNJA (v5): egzaktni Skellam AH push + hazard scenarij */
  kvant: KvantKontekst;
};

export type KvantAh = { linija: string; win: number; push: number; loss: number; fer: number };
export type KvantKontekst = {
  skellam: { p1: number; pX: number; p2: number; ah: KvantAh[]; pushRizikMax: number };
  hazard: {
    beta: number;
    primijenjen: boolean;
    scenarij: string;
    lamDomEf: number;
    lamGostEf: number;
  };
  /** OKOLIS (v6): weather drag — pomak golova i kornera */
  okolis?: OkolisIzlaz;
  /** SUDAC (v6): strog sudac i rizik crvenog kartona */
  sudac?: SudacIzlaz;
};

const TRZISTA: { kljuc: string; label: string; par?: [string, string] }[] = [
  { kljuc: "1", label: "Pobjeda domaćina (1)" },
  { kljuc: "X", label: "Neriješeno (X)" },
  { kljuc: "2", label: "Pobjeda gosta (2)" },
  { kljuc: "bttsDa", label: "Oba tima daju gol — DA", par: ["bttsDa", "bttsNe"] },
  { kljuc: "bttsNe", label: "Oba tima daju gol — NE" },
  { kljuc: "o15", label: "Više od 1.5 golova" },
  { kljuc: "u15", label: "Manje od 1.5 golova" },
  { kljuc: "o25", label: "Više od 2.5 golova" },
  { kljuc: "u25", label: "Manje od 2.5 golova" },
  { kljuc: "o35", label: "Više od 3.5 golova" },
  { kljuc: "u35", label: "Manje od 3.5 golova" },
];

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function cistaForma(f: FormaGolovi | null | undefined): FormaGolovi | null {
  if (!f || typeof f !== "object") return null;
  const n = broj(f.odigrano as unknown, 0, 0, 60);
  if (n <= 0) return null;
  const pod = (v: unknown) => broj(v as unknown, 0, 0, 300);
  const omjer = (v: unknown) => broj(v as unknown, 0, 0, 1);
  return {
    odigrano: Math.round(n),
    postignuti: pod(f.postignuti),
    primljeni: pod(f.primljeni),
    // btts/over15/over25/under35/penali su BROJI UTAKMICA (dijele se s
    // odigrano kasnije), ne omjeri — koercija kao i golovi.
    btts: pod(f.btts),
    over15: pod(f.over15),
    over25: pod(f.over25),
    under35: pod(f.under35),
    penali: pod(f.penali),
  };
}

export function sarpBrain(ulaz: SarpUlaz): SarpIzlaz {
  const faze: SarpFaza[] = [];
  // SAFE-MATH štit: sve kvote/FORME na ulazu kroz sanitizaciju —
  // string kvote ("2.10"), null, undefined i NaN ne prolaze dalje.
  const kv: Record<string, number> = {};
  if (ulaz.kvote && typeof ulaz.kvote === "object") {
    for (const [k, v] of Object.entries(ulaz.kvote)) {
      const n = cistaKvota(v as unknown);
      if (n != null) kv[k] = n;
    }
  }
  const books = Math.round(broj(ulaz.brojKladionica as unknown, 0, 0, 99));
  const formaDomCista = cistaForma(ulaz.formaDom);
  const formaGostCista = cistaForma(ulaz.formaGost);

  /* ── FAZA 1: SKUP ── */
  const brojTrzista = TRZISTA.filter((t) => kv[t.kljuc] != null && kv[t.kljuc]! >= 1.01).length;
  const odDom = formaDomCista?.odigrano ?? 0;
  const odGost = formaGostCista?.odigrano ?? 0;
  const brojIzvora =
    (brojTrzista > 0 ? 1 : 0) + // kvote
    (books > 0 ? 1 : 0) + // više kladionica
    (odDom > 0 ? 1 : 0) + // forma domaćina
    (odGost > 0 ? 1 : 0) + // forma gosta
    (ulaz.goals ? 1 : 0); // goals-motor
  faze.push({
    broj: 1,
    naziv: "Skup podataka",
    sazetak: `Dostupno ${brojTrzista} tržišta kvota${books ? ` s ${books} kladionica` : ""}, forma domaćina ${odDom} i gosta ${odGost} utakmica.`,
    podaci: [
      ...TRZISTA.filter((t) => kv[t.kljuc] != null && kv[t.kljuc]! >= 1.01).map(
        (t) => `${t.label}: ${kv[t.kljuc]!.toFixed(2)}`,
      ),
      odDom > 0
        ? `Forma domaćina: ${formaDomCista!.postignuti} postignutih / ${formaDomCista!.primljeni} primljenih u ${odDom} utakmica`
        : "Forma domaćina: nedostupna (ligaški prosjek)",
      odGost > 0
        ? `Forma gosta: ${formaGostCista!.postignuti} postignutih / ${formaGostCista!.primljeni} primljenih u ${odGost} utakmica`
        : "Forma gosta: nedostupna (ligaški prosjek)",
    ],
  });

  /* ── FAZA 2: STRUKTURA (forma → λ) ── */
  const { lam: lamF, mu: muF } = lambdaIzForme(formaDomCista, formaGostCista);
  const uzorakMali = odDom < 4 || odGost < 4;
  faze.push({
    broj: 2,
    naziv: "Struktura (forma)",
    sazetak: `Model procjenjuje ${lamF.toFixed(2)} očekivanih golova domaćina i ${muF.toFixed(2)} gosta (ukupno ${(lamF + muF).toFixed(2)}).${uzorakMali ? " Uzorak je mali — procjena je povučena prema ligaškom prosjeku." : ""}`,
    podaci: [
      odDom > 0
        ? `Domaćin: napad ${fmtPct(formaDomCista!.postignuti / odDom / 1.35)} od ligaškog prosjeka, obrana prima ${(formaDomCista!.primljeni / odDom).toFixed(2)}/utakmici`
        : "Domaćin: ligaški prosjek 1.35",
      odGost > 0
        ? `Gost: napad ${fmtPct(formaGostCista!.postignuti / odGost / 1.35)} od ligaškog prosjeka, obrana prima ${(formaGostCista!.primljeni / odGost).toFixed(2)}/utakmici`
        : "Gost: ligaški prosjek 1.35",
      `λ domaćin = ${lamF.toFixed(2)}, λ gost = ${muF.toFixed(2)}`,
    ],
  });

  /* ── FAZA 3: TRŽIŠTE (de-margin) ── */
  const dm1x2 = deMargin3(kv["1"], kv["X"], kv["2"]);
  const dmBtts = deMargin2(kv["bttsDa"], kv["bttsNe"]);
  const dmO25 = deMargin2(kv["o25"], kv["u25"]);
  const dmO15 = deMargin2(kv["o15"], kv["u15"]);
  const dmO35 = deMargin2(kv["o35"], kv["u35"]);
  const trziste: Record<string, number> = {};
  if (dm1x2) {
    trziste["1"] = dm1x2.p1;
    trziste["X"] = dm1x2.pX;
    trziste["2"] = dm1x2.p2;
  }
  if (dmBtts) {
    trziste["bttsDa"] = dmBtts.pA;
    trziste["bttsNe"] = dmBtts.pB;
  }
  if (dmO15) {
    trziste["o15"] = dmO15.pA;
    trziste["u15"] = dmO15.pB;
  }
  if (dmO25) {
    trziste["o25"] = dmO25.pA;
    trziste["u25"] = dmO25.pB;
  }
  if (dmO35) {
    trziste["o35"] = dmO35.pA;
    trziste["u35"] = dmO35.pB;
  }
  const nTrz = Object.keys(trziste).length;
  // implicitni ukupni golovi iz linija (težina: 2.5 najveća)
  let lamTrz: number | null = null;
  {
    const dijelovi: Array<{ lam: number; w: number }> = [];
    const lambdaIzOu = (line: number, pOver: number) => {
      const k = Math.floor(line);
      let lo = 0.05,
        hi = 8;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        // P(≤ k) je 1 − pOver; CDF opada s λ
        // (ista bisekcija kao u goals-motoru)
        const cdf = (l: number) => {
          let p = Math.exp(-l);
          let s = p;
          for (let j = 1; j <= k; j++) {
            p *= l / j;
            s += p;
          }
          return s;
        };
        if (cdf(mid) > 1 - pOver) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    if (dmO25) dijelovi.push({ lam: lambdaIzOu(2.5, dmO25.pA), w: 0.5 });
    if (dmO15) dijelovi.push({ lam: lambdaIzOu(1.5, dmO15.pA), w: 0.25 });
    if (dmO35) dijelovi.push({ lam: lambdaIzOu(3.5, dmO35.pA), w: 0.25 });
    if (dijelovi.length) {
      const wS = dijelovi.reduce((a, d) => a + d.w, 0);
      lamTrz = dijelovi.reduce((a, d) => a + d.lam * d.w, 0) / wS;
    }
  }
  faze.push({
    broj: 3,
    naziv: "Tržište (de-marginiranje)",
    sazetak: nTrz
      ? `Uklonjena bookmaker marža s ${nTrz} stavki. Tržište implicira ${lamTrz != null ? `${lamTrz.toFixed(2)} ukupnih golova` : "raspored bez ukupne linije"}${dm1x2 ? `, pobjeda domaćina ${fmtPct(dm1x2.p1)}, neriješeno ${fmtPct(dm1x2.pX)}, gost ${fmtPct(dm1x2.p2)}` : ""}.`
      : "Kvote nisu dostupne — model radi bez tržišne kalibracije.",
    podaci: Object.entries(trziste).map(
      ([k, p]) => `${TRZISTA.find((t) => t.kljuc === k)?.label ?? k}: ${fmtPct(p)}`,
    ),
  });

  /* ── FAZA 4: MODEL (grid + Skellam) ── */
  // fuzija ukupnih golova: tržište i forma
  const wMarket = lamTrz != null ? clamp(0.25 + 0.05 * nTrz, 0.25, 0.55) : 0;
  const lamUk = lamTrz != null ? wMarket * lamTrz + (1 - wMarket) * (lamF + muF) : lamF + muF;
  // razdvoba: iz forme, kalibrirana 1X2 tržištem ako postoji
  const bazaRazd = lamF + muF > 0 ? lamF / (lamF + muF) : 0.55;
  let razd = bazaRazd;
  if (dm1x2) {
    let best = bazaRazd,
      bestErr = Infinity;
    for (let r = 0.08; r <= 0.921; r += 0.04) {
      const m = metrikeIzGrida(izgradiGrid(lamUk * r, lamUk * (1 - r), 0));
      const err = (m.p1 - dm1x2.p1) ** 2 + (m.pX - dm1x2.pX) ** 2 + (m.p2 - dm1x2.p2) ** 2;
      if (err < bestErr) {
        bestErr = err;
        best = r;
      }
    }
    razd = best;
  }
  // OKOLIS (v6): weather drag — vjetar > 35 km/h / jaka kiša / loš teren
  // skida ukupnu λ za −0.22 (proporcionalno po timovima) i −1.5
  // kornera. Bez inputa: identitet.
  const okolis = okolisPomak(ulaz.okolis);
  let lamH = clamp(lamUk * razd, 0.1, 4.5);
  let lamA = clamp(lamUk * (1 - razd), 0.1, 4.5);
  if (okolis.primijenjeno) {
    const uk = lamH + lamA;
    lamH = clamp(lamH + okolis.pomakGolovi * (lamH / uk), 0.05, 4.5);
    lamA = clamp(lamA + okolis.pomakGolovi * (lamA / uk), 0.05, 4.5);
  }
  // SUDAC (v6): profil suca — strog sudac ( > 5.0 kartona ili > 0.4
  // penala /utakmici) diže rizik crvenog kartona na > 18%.
  const sudac = sudacProfil(ulaz.sudac);
  // UNIVERSAL MATCH CONTEXT (v7): xG i motivacija iz normaliziranog
  // konteksta utakmice (safe-math). Blaga težina (xG 20%, motivacija ±4%)
  // — bez konteksta: identitet.
  const cx = ulaz.kontekst;
  if (cx && cx.sport === "nogomet") {
    const lamXg = cx.homeXG + cx.awayXG;
    if (lamXg > 0.4) {
      const w = 0.2;
      const ukNov = clamp(w * lamXg + (1 - w) * (lamH + lamA), 0.4, 7);
      const dijelj = lamH + lamA > 0 ? lamH / (lamH + lamA) : 0.5;
      lamH = clamp(ukNov * dijelj, 0.1, 4.5);
      lamA = clamp(ukNov * (1 - dijelj), 0.1, 4.5);
    }
    if (Math.abs(cx.motivationIndex - 0.5) > 1e-9) {
      const fH = 1 + (cx.motivationIndex - 0.5) * 0.08;
      const fA = 1 - (cx.motivationIndex - 0.5) * 0.08;
      lamH = clamp(lamH * fH, 0.05, 4.5);
      lamA = clamp(lamA * fA, 0.05, 4.5);
    }
  }
  // rho: fit na tržište U 1.5 kad postoji
  let rho = -0.05;
  if (dmO15) {
    let best = -0.05,
      bestErr = Infinity;
    for (let r = -0.18; r <= 0.181; r += 0.02) {
      const m = metrikeIzGrida(izgradiGrid(lamH, lamA, r));
      const err = Math.abs(1 - m.o15 - (1 - dmO15.pA));
      if (err < bestErr) {
        bestErr = err;
        best = r;
      }
    }
    rho = best;
  }
  const G = izgradiGrid(lamH, lamA, rho);
  const M = metrikeIzGrida(G);
  const sk = skellam1x2(lamH, lamA);
  const suglasnostSkellam = clamp(
    1 - (Math.abs(M.p1 - sk.p1) + Math.abs(M.pX - sk.pX) + Math.abs(M.p2 - sk.p2)),
    0,
    1,
  );

  // KVANT NADGRADNJA (v5): egzaktni Skellam AH — ključne linije za
  // domaćina i gosta s vidljivim PUSH RISK % na cjelobrojnim linijama.
  const AH_LINIJE: Array<[string, number]> = [
    ["−1.0", -1],
    ["−1.5", -1.5],
    ["+0.5", 0.5],
    ["+1.0", 1],
  ];
  const ahDom = AH_LINIJE.map(([label, L]) => {
    const r = ahSkellam(lamH, lamA, L);
    return { linija: label, win: r.win, push: r.push, loss: r.loss, fer: r.ferWin };
  });
  const ahGost = AH_LINIJE.map(([, L]) => {
    const r = ahSkellam(lamA, lamH, L);
    const labelGost = (L > 0 ? "−" : "+") + Math.abs(L).toFixed(1);
    return { linija: labelGost, win: r.win, push: r.push, loss: r.loss, fer: r.ferWin };
  });
  const pushRizikMax = Math.max(...ahDom.map((a) => a.push), ...ahGost.map((a) => a.push));
  // HAZARD scenarij: underdog = tim s manjom pred-meč λ; ako on da
  // prvi gol u 0–20 min, obje efektivne λ rastu ×β = 1.18.
  const underdogGost = lamA < lamH;
  const kvant: KvantKontekst = {
    skellam: {
      p1: sk.p1,
      pX: sk.pX,
      p2: sk.p2,
      ah: [...ahDom, ...ahGost],
      pushRizikMax: Math.round(pushRizikMax * 1000) / 1000,
    },
    hazard: {
      beta: HAZARD_BETA,
      primijenjen: true,
      scenarij: underdogGost
        ? `prvi gol gosta (underdog, λ ${lamA.toFixed(2)}) u 0–20 min`
        : `prvi gol domaćina (underdog, λ ${lamH.toFixed(2)}) u 0–20 min`,
      lamDomEf: Math.round(lamH * HAZARD_BETA * 100) / 100,
      lamGostEf: Math.round(lamA * HAZARD_BETA * 100) / 100,
    },
    okolis: {
      primijenjeno: okolis.primijenjeno,
      pomakGolovi: okolis.pomakGolovi,
      pomakKornera: okolis.pomakKornera,
      razlozi: okolis.razlozi,
      opis: okolis.opis,
    },
    sudac: {
      primijenjeno: sudac.primijenjeno,
      strog: sudac.strog,
      rizikCrvena: sudac.rizikCrvena,
      opis: sudac.opis,
    },
  };
  faze.push({
    broj: 4,
    naziv: "Model (Poisson + Dixon-Coles + Skellam)",
    sazetak: `Matrica rezultata 10×10 daje 1 ${fmtPct(M.p1)} · X ${fmtPct(M.pX)} · 2 ${fmtPct(M.p2)}, BTTS ${fmtPct(M.btts)}, O2.5 ${fmtPct(M.o25)}. Skellam nezavisna provjera slaže se ${fmtPct(suglasnostSkellam)}. AH push rizik (Skellam): najviše ${(pushRizikMax * 100).toFixed(1)}%.`,
    podaci: [
      `λ domaćin = ${lamH.toFixed(2)}, λ gost = ${lamA.toFixed(2)}, rho = ${rho.toFixed(2)}`,
      `Skellam: 1 ${fmtPct(sk.p1)} · X ${fmtPct(sk.pX)} · 2 ${fmtPct(sk.p2)}`,
      `Najvjerojatniji rezultat: ${M.topRezultati[0]?.rezultat ?? "—"} (${fmtPct(M.topRezultati[0]?.p ?? 0)})`,
      ...(okolis.primijenjeno ? [`Okolis: ${okolis.opis}`] : []),
      ...(sudac.primijenjeno ? [`Sudac: ${sudac.opis}`] : []),
    ],
  });

  /* ── FAZA 5: FUZIJA (konsenzus s goals-motorom) ── */
  const konsenzus: Record<string, number> = {};
  let tezinaGoals = 0;
  if (ulaz.goals?.final) {
    const gf = ulaz.goals.final;
    const kljucevi = [
      "1",
      "X",
      "2",
      "bttsDa",
      "bttsNe",
      "o15",
      "u15",
      "o25",
      "u25",
      "o35",
      "u35",
    ].filter((k) => typeof gf[k] === "number");
    // težina goals-motoru po njegovom povjerenju (0..100 → 0.35..0.65)
    tezinaGoals = clamp(0.35 + (ulaz.goals.povjerenje / 100) * 0.3, 0.35, 0.65);
    // miješamo goals-final i SARP grid za zajedničke ključeve
    const gridP: Record<string, number> = {
      "1": M.p1,
      X: M.pX,
      "2": M.p2,
      bttsDa: M.btts,
      bttsNe: 1 - M.btts,
      o15: M.o15,
      u15: 1 - M.o15,
      o25: M.o25,
      u25: 1 - M.o25,
      o35: M.o35,
      u35: 1 - M.o35,
    };
    for (const k of kljucevi)
      konsenzus[k] = tezinaGoals * gf[k]! + (1 - tezinaGoals) * (gridP[k] ?? gf[k]!);
  } else {
    konsenzus["1"] = M.p1;
    konsenzus["X"] = M.pX;
    konsenzus["2"] = M.p2;
    konsenzus["bttsDa"] = M.btts;
    konsenzus["bttsNe"] = 1 - M.btts;
    konsenzus["o15"] = M.o15;
    konsenzus["u15"] = 1 - M.o15;
    konsenzus["o25"] = M.o25;
    konsenzus["u25"] = 1 - M.o25;
    konsenzus["o35"] = M.o35;
    konsenzus["u35"] = 1 - M.o35;
  }
  const razlikaKons = Object.keys(konsenzus)
    .filter((k) => trziste[k] != null)
    .reduce((a, k) => a + Math.abs(konsenzus[k]! - trziste[k]!), 0);
  const nKons = Object.keys(konsenzus).filter((k) => trziste[k] != null).length;
  const avgRazlika = nKons ? razlikaKons / nKons : null;
  faze.push({
    broj: 5,
    naziv: "Fuzija (konsenzus)",
    sazetak: ulaz.goals
      ? `Konsenzus SARP-matrice i goals-motora (težina motora ${(tezinaGoals * 100).toFixed(0)}%${avgRazlika != null ? `, prosječno odstupanje od tržišta ${(avgRazlika * 100).toFixed(1)} pp` : ""}).`
      : "SARP matrica je jedini model (goals-motor nije bio dostupan).",
    podaci: Object.entries(konsenzus)
      .slice(0, 8)
      .map(([k, p]) => `${TRZISTA.find((t) => t.kljuc === k)?.label ?? k}: ${fmtPct(p)}`),
  });

  /* ── FAZA 6: MONTE CARLO ── */
  const mc = monteCarlo(G, 10_000, (ulaz.utakmica.id % 100000) + 7);
  faze.push({
    broj: 6,
    naziv: "Monte Carlo (10.000 simulacija)",
    sazetak: `Od 10.000 simulacija najčešći rezultat je ${mc.topRezultati[0]?.rezultat ?? "—"} (${mc.topRezultati[0]?.broj ?? 0}×), BTTS u ${fmtPct(mc.btts)}, O2.5 u ${fmtPct(mc.o25)} simulacija.`,
    podaci: mc.topRezultati.map((t) => `${t.rezultat}: ${t.broj}× (${fmtPct(t.p)})`),
  });

  /* ── FAZA 7: ODLUKA ── */
  // glavni tip: najveći EV među tržištima s kvotom, uz prag vjerojatnosti
  let core: SarpTip | null = null;
  for (const t of TRZISTA) {
    const p = konsenzus[t.kljuc];
    const kvo = kv[t.kljuc];
    if (p == null || !(p >= 0.3)) continue;
    const edge = kvo != null && kvo >= 1.01 ? p * kvo - 1 : null;
    const kellyPct = kvo != null && kvo >= 1.01 ? kellyUlogPct(p, kvo) : 0;
    if (edge != null && edge >= 0.02) {
      if (!core || (core.edge ?? -1) < edge) {
        core = {
          kljuc: t.kljuc,
          label: t.label,
          p,
          kvota: kvo,
          edge,
          kellyPct,
          izvor: "konsenzus",
        };
      }
    }
  }
  if (!core) {
    // nema vrijednosti u kvotama → najvjerojatniji ishod s kvotom, inače čisti model
    const sKvotom = TRZISTA.map((t) => ({ t, p: konsenzus[t.kljuc] ?? -1, kvo: kv[t.kljuc] }))
      .filter((x) => x.p >= 0.3 && x.kvo != null && x.kvo >= 1.01)
      .sort((a, b) => b.p - a.p)[0];
    if (sKvotom) {
      core = {
        kljuc: sKvotom.t.kljuc,
        label: sKvotom.t.label,
        p: sKvotom.p,
        kvota: sKvotom.kvo ?? null,
        edge: sKvotom.p * (sKvotom.kvo ?? 1) - 1,
        kellyPct: kellyUlogPct(sKvotom.p, sKvotom.kvo ?? 1),
        izvor: "konsenzus",
      };
    } else {
      const bezKvote = TRZISTA.map((t) => ({ t, p: konsenzus[t.kljuc] ?? -1 })).sort(
        (a, b) => b.p - a.p,
      )[0];
      if (bezKvote && bezKvote.p >= 0.3) {
        core = {
          kljuc: bezKvote.t.kljuc,
          label: bezKvote.t.label,
          p: bezKvote.p,
          kvota: null,
          edge: null,
          kellyPct: 0,
          izvor: "model",
        };
      } else {
        core = {
          kljuc: "o25",
          label: "Više od 2.5 golova",
          p: konsenzus["o25"] ?? 0.5,
          kvota: null,
          edge: null,
          kellyPct: 0,
          izvor: "model",
        };
      }
    }
  }
  // alternativni tip: sigurnija opcija (najveća vjerojatnost, različito tržište)
  let alt: SarpTip | null = null;
  for (const t of TRZISTA) {
    if (t.kljuc === core.kljuc) continue;
    // nemoj nuditi suprotnu stranu istog tržišta kao alternativu
    const par = TRZISTA.find((x) => x.kljuc === core.kljuc)?.par;
    if (par && (par[0] === t.kljuc || par[1] === t.kljuc)) continue;
    const p = konsenzus[t.kljuc];
    if (p == null || !(p >= 0.5)) continue;
    const kvo = kv[t.kljuc];
    if (!alt || p > alt.p) {
      alt = {
        kljuc: t.kljuc,
        label: t.label,
        p,
        kvota: kvo != null && kvo >= 1.01 ? kvo : null,
        edge: kvo != null && kvo >= 1.01 ? p * kvo - 1 : null,
        kellyPct: kvo != null && kvo >= 1.01 ? kellyUlogPct(p, kvo) : 0,
        izvor: kvo != null ? "konsenzus" : "model",
      };
    }
  }

  /* rizici */
  const rizici: string[] = [];
  if (uzorakMali)
    rizici.push(
      "Mali uzorak forme (< 4 utakmice) — prosjeke vodi više ligaški prosjek nego stvarna forma.",
    );
  if (nTrz === 0)
    rizici.push(
      "Bez kvota — nema tržišne kalibracije ni realnog uloga (Kelly = 0 dok kvote ne dođu).",
    );
  if (avgRazlika != null && avgRazlika > 0.1)
    rizici.push(
      `Model i tržište se znatno razilaze (${(avgRazlika * 100).toFixed(1)} pp) — tržište često zna za ozljede, postave ili motivaciju koje model ne vidi.`,
    );
  rizici.push("Model ne vidi ozljede, suspenzije ni postave — provjeri tim vijesti prije uloga.");
  rizici.push(
    "Crveni karton ili rani gol dramatično mijenjaju tok — planiraj ulog koji takav scenarij ne slama.",
  );
  if (books > 0 && books < 3)
    rizici.push(`Samo ${books} kladionica daje kvote — tržišni signal je slabiji.`);
  if (sudac.strog)
    rizici.push(`STROG SUDAC: ${sudac.opis} — HT/FT i tržišta kartona nose dodatnu varijancu.`);
  if (okolis.primijenjeno)
    rizici.push(`Okolis: ${okolis.opis} — projekcija ukupnih golova i kornera smanjena.`);
  if (suglasnostSkellam < 0.85)
    rizici.push("Poisson i Skellam (bez korelacije) se razilaze — visoka varijanca u ishodu.");

  /* obrazloženje (3–6 rečenica) */
  const obrazlozenje: string[] = [];
  obrazlozenje.push(
    `Faza forma+tržište: model miješa formu (${lamF.toFixed(2)} + ${muF.toFixed(2)} golova)` +
      (lamTrz != null
        ? ` s tržišnom procjenom ukupnih golova (${lamTrz.toFixed(2)}) u omjeru ${(100 - wMarket * 100).toFixed(0)}/${(wMarket * 100).toFixed(0)}`
        : "") +
      `, pa ukupno očekuje ${lamUk.toFixed(2)} golova.`,
  );
  obrazlozenje.push(
    `Razdvoba po timovima: domaćin ${lamH.toFixed(2)}, gost ${lamA.toFixed(2)}${dm1x2 ? " — kalibrirano de-marginiranim 1X2 tržištem" : " — iz forme (1X2 kvote nisu dostupne)"}.`,
  );
  obrazlozenje.push(
    `Matrica rezultata (Poisson + Dixon-Coles, rho ${rho.toFixed(2)}) daje ${M.topRezultati[0]?.rezultat ?? "—"} kao najvjerojatniji rezultat, a Monte Carlo od 10.000 simulacija to potvrđuje (${mc.topRezultati[0]?.rezultat ?? "—"} ${fmtPct(mc.topRezultati[0]?.p ?? 0)}).`,
  );
  obrazlozenje.push(
    `Ključne brojke: BTTS ${fmtPct(konsenzus["bttsDa"] ?? 0)}, Over 2.5 ${fmtPct(konsenzus["o25"] ?? 0)}, pobjeda domaćina ${fmtPct(konsenzus["1"] ?? 0)}.`,
  );
  obrazlozenje.push(
    core.edge != null && core.edge > 0
      ? `Glavni tip "${core.label}" nosi edge ${(core.edge * 100).toFixed(1)}% na kvoti ${core.kvota?.toFixed(2) ?? "—"} — pozitivan očekivani dobitak po ¼ Kelly pravilu (${core.kellyPct.toFixed(1)}% banke).`
      : `Glavni tip "${core.label}" je najvjerojatniji ishod${core.kvota ? `, ali tržište ga već dobro cijeni (nema značajnog edgea)` : " — kvota još nije objavljena"}.`,
  );
  if (alt) {
    obrazlozenje.push(
      `Sigurnija alternativa je "${alt.label}" s ${fmtPct(alt.p)} vjerojatnosti${alt.kvota ? ` na kvoti ${alt.kvota.toFixed(2)}` : ""} — za manji rizik ili duplu pokrivenost.`,
    );
  }

  /* povjerenje i ocjena A/B/C */
  const pokrTrz = nTrz > 0 ? clamp(nTrz / 11, 0, 1) : 0;
  const pokrForma = clamp(Math.min(odDom, odGost) / 6, 0, 1);
  const pokrSugl = avgRazlika == null ? 0.5 : clamp(1 - avgRazlika * 8, 0, 1);
  const pokrMc = clamp(1 - Math.abs((konsenzus["o25"] ?? 0.5) - mc.o25) * 10, 0, 1);
  const povjerenje = Math.round(
    (pokrTrz * 0.3 + pokrForma * 0.2 + pokrSugl * 0.3 + pokrMc * 0.2) * 100,
  );
  const ocjena: SarpIzlaz["ocjena"] = povjerenje >= 75 ? "A" : povjerenje >= 55 ? "B" : "C";

  /* match info */
  const matchInfo = {
    naslov: `${ulaz.utakmica.home} — ${ulaz.utakmica.away}`,
    liga: [ulaz.utakmica.country, ulaz.utakmica.league].filter(Boolean).join(" · "),
    vrijeme: ulaz.utakmica.time ?? null,
    kvote: TRZISTA.filter((t) => kv[t.kljuc] != null && kv[t.kljuc]! >= 1.01)
      .slice(0, 7)
      .map((t) => ({ kljuc: t.kljuc, label: t.label, kvota: kv[t.kljuc]! })),
  };

  faze.push({
    broj: 7,
    naziv: "Odluka",
    sazetak: `Glavni tip: ${core.label} (p = ${fmtPct(core.p)}${core.kvota ? `, kvota ${core.kvota.toFixed(2)}` : ""}${core.edge != null ? `, edge ${(core.edge * 100).toFixed(1)}%` : ""}).${alt ? ` Alternativa: ${alt.label} (${fmtPct(alt.p)}).` : ""} Ocjena ${ocjena} (${povjerenje}/100), ${brojIzvora} izvora podataka.`,
    podaci: rizici,
  });

  return {
    faze,
    matchInfo,
    coreTip: core,
    altTip: alt,
    obrazlozenje,
    rizici,
    ocjena,
    povjerenje,
    brojIzvora,
    lambdaDom: Math.round(lamH * 100) / 100,
    lambdaGost: Math.round(lamA * 100) / 100,
    lambdaUkupno: Math.round((lamH + lamA) * 100) / 100,
    konsenzus,
    mc,
    suglasnostSkellam: Math.round(suglasnostSkellam * 1000) / 1000,
    kvant,
  };
}
