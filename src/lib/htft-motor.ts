import { HAZARD_BETA } from "./skellam";

/* ═══════════════════════════════════════════════════════════════════
   HTFT-MOTOR — Prijelazni HT/FT engine za sva tri sporta (v1)
   ═══════════════════════════════════════════════════════════════════
   NOGOMET — bivarijantni prijelazni model za svih 9 stanja:
     • λ_HT = 0.44 · λ_FT (literaturni udio golova u 1. poluvremenu)
     • točne Poisson vjerojatnosti za 0, 1, 2, 3+ golova u 1. pol.
     • drugo poluvrijeme NIJE konstantno: tim koji gubi tlači
       (λ ×1.25), tim koji vodi drži rezultat (λ ×0.90), remi →
       oba otvoreno (×1.05). Prijelazna matrica HT → FT je onda
       uvjetna Skellam/prijelazna distribucija — "bivarijantna
       Markov" struktura stanja (1/1, X/1, 2/1, 1/X, X/X, 2/X,
       1/2, X/2, 2/2).
     • Reverse Risk indikator: P(1/2) + P(2/1) — vjerojatnost
       potpunog preokreta.

   KOŠARKA — HT/FT moneyline (Home/Home, Home/Away, Away/Home,
     Away/Away):
     • 1. poluvrijeme ~2.5% brže od 2. (namjerni prekršaji u Q4)
     • σ_HT = σ_FT / √2 (specifikacija)
     • uvjetni normalni model: FT marža | HT marža ~ N(HT + μ2H, σ2H)
       → egzaktna numerička integracija po mreži
     • HT vodstvo → FT pobjeda konverzija

   RUKOMET — HT/FT s golman-morom i isključenjima:
     • udio golova u 1. poluvremenu 47% (+ lagano brže 2. pol.:
       umor golmana i opuštanje obrane podižu efikasnost napada)
     • isključenja koreliraju s HT zaostatkom: tim koji zaostaje
       u 2. pol. tlači (λ ×1.12), vodi drži (λ ×0.92)
     • HT vodstvo → FT pobjeda konverzija (po stanjima)

   CISTE FUNKCIJE — bez API-ja, bez ovisnosti.
   ═══════════════════════════════════════════════════════════════════ */

/* ── NOGOMET ─────────────────────────────────────────────────────── */

export const HT_UDIO = 0.44; // udio golova u 1. poluvremenu

const N = 8; // maks. golova po timu po poluvremenu u gridu

function pois(k: number, lam: number): number {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

function dcTau(h: number, a: number, lam: number, mu: number, rho: number): number {
  if (rho === 0) return 1;
  if (h === 0 && a === 0) return 1 - lam * mu * rho;
  if (h === 0 && a === 1) return 1 + lam * rho;
  if (h === 1 && a === 0) return 1 + mu * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function grid(lam: number, mu: number, rho: number): number[][] {
  const g: number[][] = [];
  let z = 0;
  for (let h = 0; h <= N; h++) {
    g[h] = [];
    for (let a = 0; a <= N; a++) {
      const v = Math.max(0, pois(h, lam) * pois(a, mu) * dcTau(h, a, lam, mu, rho));
      g[h]![a] = v;
      z += v;
    }
  }
  for (let h = 0; h <= N; h++) for (let a = 0; a <= N; a++) g[h]![a] = g[h]![a]! / (z || 1);
  return g;
}

/** P(golova ukupno u 1. pol. = 0 / 1 / 2 / 3+), točno iz Poissona. */
export function htGolovi(
  lamH: number,
  lamA: number,
): { nula: number; jedan: number; dva: number; triPlus: number } {
  const L = Math.max(0.01, HT_UDIO * (lamH + lamA));
  const p0 = Math.exp(-L);
  const p1 = L * Math.exp(-L);
  const p2 = ((L * L) / 2) * Math.exp(-L);
  return { nula: p0, jedan: p1, dva: p2, triPlus: Math.max(0, 1 - p0 - p1 - p2) };
}

export type HtFtNogometIzlaz = {
  lamHT: number; // ukupni očekivani golovi 1. poluvremena
  htGolovi: { nula: number; jedan: number; dva: number; triPlus: number };
  ht: { p1: number; pX: number; p2: number };
  stanja: { kod: string; p: number; ferOdd: number }[]; // svih 9
  top3: { kod: string; p: number; ferOdd: number }[];
  prijelazi: Record<"1" | "X" | "2", Record<"1" | "X" | "2", number>>;
  drzanje: number; // Σ P(HT=s)·P(FT=s|HT=s)
  okretanje: number; // 1 − drzanje
  /** REVERSE RISK: P(1/2) + P(2/1) — potpuni preokreti */
  preokreti: number;
  preokret12: number;
  preokret21: number;
  razinaPreokreta: "nisko" | "srednje" | "visoko";
  /** KONZISTENTNOST LOCK: zbroj svih 9 stanja (mora biti tačno 1) */
  zbrojStanja: number;
  /** HAZARD β=1.18: primijenjen na stanja u kojima UNDERDOG vodi */
  hazardBeta: number;
  hazardPrimijenjen: boolean;
};

/** Glavni nogometni HT/FT proračun iz očekivanih golova cijele utakmice. */
export function htftNogomet(lamH: number, lamA: number): HtFtNogometIzlaz {
  const lamHT_H = HT_UDIO * lamH;
  const lamHT_A = HT_UDIO * lamA;
  const lam2H_H = lamH - lamHT_H;
  const lam2H_A = lamA - lamHT_A;

  // HT grid (lagani DC rho −0.02: nisko-skor koji 1. pol. voli remi)
  const gHT = grid(lamHT_H, lamHT_A, -0.02);

  // stanje HT: "1" dom vodi, "X", "2" gost vodi
  const pHTs: Record<"1" | "X" | "2", number> = { "1": 0, X: 0, "2": 0 };
  const uvjetRazd: Record<"1" | "X" | "2", number[][]> = {} as never;
  for (const s of ["1", "X", "2"] as const) {
    const g: number[][] = [];
    let z = 0;
    for (let h = 0; h <= N; h++) {
      g[h] = [];
      for (let a = 0; a <= N; a++) {
        const dodjeli = s === "1" ? h > a : s === "X" ? h === a : h < a;
        const v = dodjeli ? gHT[h]![a]! : 0;
        g[h]![a] = v;
        z += v;
      }
    }
    if (z > 0) for (let h = 0; h <= N; h++) for (let a = 0; a <= N; a++) g[h]![a] = g[h]![a]! / z;
    uvjetRazd[s] = g;
    pHTs[s] = z;
  }
  const ht: { p1: number; pX: number; p2: number } = {
    p1: pHTs["1"],
    pX: pHTs["X"],
    p2: pHTs["2"],
  };

  // 2. poluvrijeme: prijelazna dinamika po HT stanju
  // HAZARD MODEL (β=1.18, v5): ako UNDERDOG (tim s nižom pred-meč λ)
  // vodi na HT (što je HT-slika scenarija "prvi gol underdog u 0–20
  // min"), taktička ploča se otvara — OBA λ₂H dobivaju ×β na vrh
  // postojeće dinamike (tlačenje ×1.25 / držanje ×0.90 se čuvaju, ne
  // zamjenjuju — bez dvostruke kazne istog efekta).
  const underdogGost = lamA < lamH; // slabiji tim s manjim λ
  const underdogDom = lamH < lamA;
  const betaDomVodi = underdogDom ? HAZARD_BETA : 1; // dom vodi na HT (stanje 1)
  const betaGostVodi = underdogGost ? HAZARD_BETA : 1; // gost vodi na HT (stanje 2)
  const dinamika: Record<"1" | "X" | "2", { h: number; a: number }> = {
    // dom vodi: gost tlači (A ×1.25), dom drži (H ×0.90) [+ hazard ako je dom underdog]
    "1": { h: lam2H_H * 0.9 * betaDomVodi, a: lam2H_A * 1.25 * betaDomVodi },
    // remi: oba otvoreno
    X: { h: lam2H_H * 1.05, a: lam2H_A * 1.05 },
    // gost vodi: dom tlači [+ hazard ako je gost underdog]
    "2": { h: lam2H_H * 1.25 * betaGostVodi, a: lam2H_A * 0.9 * betaGostVodi },
  };

  // P(2H razlika = d) za dato stanje (zbrajanje po gridu 0..N)
  const razd2H: Record<"1" | "X" | "2", number[]> = {} as never;
  for (const s of ["1", "X", "2"] as const) {
    const { h: lh, a: la } = dinamika[s];
    const d: number[] = new Array(2 * N + 1).fill(0);
    for (let h = 0; h <= N; h++)
      for (let a = 0; a <= N; a++) d[h - a + N]! += pois(h, lh) * pois(a, la);
    razd2H[s] = d;
  }

  // 9 stanja: P(HT=s) · P(FT=f | HT=s) gdje FT = znak(razdHT + razd2H)
  type Celija = { kod: string; p: number; ferOdd: number };
  const celije: Celija[] = [];
  const prijelazi: Record<"1" | "X" | "2", Record<"1" | "X" | "2", number>> = {
    "1": { "1": 0, X: 0, "2": 0 },
    X: { "1": 0, X: 0, "2": 0 },
    "2": { "1": 0, X: 0, "2": 0 },
  };
  const kodovi: Record<"1" | "X" | "2", string> = { "1": "1", X: "X", "2": "2" };
  for (const s of ["1", "X", "2"] as const) {
    for (const f of ["1", "X", "2"] as const) {
      let p = 0;
      const gu = uvjetRazd[s];
      for (let h = 0; h <= N; h++) {
        for (let a = 0; a <= N; a++) {
          const rHT = h - a;
          if (gu[h]![a]! <= 0) continue;
          for (let d = -N; d <= N; d++) {
            const w = razd2H[s][d + N]!;
            if (w <= 0) continue;
            const rFT = rHT + d;
            const ishod = rFT > 0 ? "1" : rFT === 0 ? "X" : "2";
            if (ishod === f) p += gu[h]![a]! * w;
          }
        }
      }
      prijelazi[s][f] = p;
      celije.push({
        kod: `${kodovi[s]}/${kodovi[f]}`,
        p: pHTs[s] * p,
        ferOdd: pHTs[s] * p > 0.0005 ? 1 / (pHTs[s] * p) : 9999,
      });
    }
  }
  const zbroj = celije.reduce((a, c) => a + c.p, 0);
  for (const c of celije) c.p /= zbroj || 1;
  // KONZISTENTNOST LOCK: nakon normalizacije zbroj 9 stanja je točno 1
  const zbrojStanja = celije.reduce((a, c) => a + c.p, 0);
  celije.sort((a, b) => b.p - a.p);

  const drzanje =
    pHTs["1"] * prijelazi["1"]["1"] +
    pHTs["X"] * prijelazi["X"]["X"] +
    pHTs["2"] * prijelazi["2"]["2"];
  const preokret12 = celije.find((c) => c.kod === "1/2")!.p;
  const preokret21 = celije.find((c) => c.kod === "2/1")!.p;
  const preokreti = preokret12 + preokret21;
  const razinaPreokreta: HtFtNogometIzlaz["razinaPreokreta"] =
    preokreti >= 0.12 ? "visoko" : preokreti >= 0.07 ? "srednje" : "nisko";

  return {
    lamHT: Math.round((lamHT_H + lamHT_A) * 100) / 100,
    htGolovi: htGolovi(lamH, lamA),
    ht,
    stanja: celije,
    top3: celije.slice(0, 3).map((c) => ({ kod: c.kod, p: c.p, ferOdd: c.ferOdd })),
    prijelazi,
    drzanje,
    okretanje: 1 - drzanje,
    preokreti,
    preokret12,
    preokret21,
    razinaPreokreta,
    zbrojStanja: Math.round(zbrojStanja * 1e12) / 1e12,
    hazardBeta: HAZARD_BETA,
    hazardPrimijenjen: underdogGost || underdogDom,
  };
}

/* ── KOŠARKA ─────────────────────────────────────────────────────── */

export const KO_1H_DIO = 0.505; // 1H ~2.5% brže od 2H (namjerni prekršaji u Q4)

function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return s * y;
}
/** Standardna normalna CDF. */
export function Phi(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export type HtFtKosarkaIzlaz = {
  exp1H_H: number;
  exp1H_A: number;
  sigmaHT: number;
  sigma2H: number;
  pHTHome: number;
  pHTDraw: number;
  pHTAway: number;
  kombinacije: { kod: string; label: string; p: number; ferOdd: number }[];
  /** HT vodstvo dom → FT pobjeda dom */
  konverzija: { home: number; away: number };
  preokreti: number; // P(Home/Away) + P(Away/Home)
  razinaPreokreta: "nisko" | "srednje" | "visoko";
};

/**
 * Košarka HT/FT: σ_HT = σ_FT/√2; uvjetno: FT | HT ~ N(HT + μ2H, σ2H).
 * Egzaktna numerička integracija po mreži HT marže.
 */
export function htftKosarka(expHome: number, expAway: number, sigmaFT: number): HtFtKosarkaIzlaz {
  const exp1H_H = expHome * KO_1H_DIO;
  const exp1H_A = expAway * KO_1H_DIO;
  const mu1 = exp1H_H - exp1H_A; // očekivana HT marža
  const sigmaHT = Math.max(1, sigmaFT / Math.SQRT2);
  const mu2 = expHome - expAway - mu1; // očekivana 2H marža
  const sigma2H = Math.max(1, Math.sqrt(Math.max(sigmaFT * sigmaFT - sigmaHT * sigmaHT, 1)));

  // HT marža je praktično cjelobrojna → remi je |M1| < 0.5,
  // vodstvo domaćina M1 ≥ 0.5, vodstvo gosta M1 ≤ −0.5 (kontinuitet).
  const pHTHome = 1 - Phi((0.5 - mu1) / sigmaHT);
  const pHTAway = Phi((-0.5 - mu1) / sigmaHT);
  const pHTDraw = Math.max(0, 1 - pHTHome - pHTAway);

  const gaussPdf = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  // P(FT ishod | M1 = m): FT = M1 + M2, M2 ~ N(mu2, sigma2H)
  // HT pojas ("dom" = M1 ≥ 0.5, "gost" = M1 ≤ −0.5) × FT strana;
  // remi-pojas |M1| < 0.5 dijeli se simetrično pola-pola.
  const kvadrant = (ht: "dom" | "gost", ft: "dom" | "gost"): number => {
    let s = 0;
    const korak = sigmaHT / 40;
    for (let m = -8 * sigmaHT; m <= 8 * sigmaHT; m += korak) {
      // težina pojasa [m − k/2, m + k/2] — egzaktnija od točke
      const w = Phi((m + korak / 2 - mu1) / sigmaHT) - Phi((m - korak / 2 - mu1) / sigmaHT);
      if (w <= 0) continue;
      const pF = ft === "dom" ? Phi((m + mu2) / sigma2H) : 1 - Phi((m + mu2) / sigma2H);
      const htW =
        ht === "dom" ? (m >= 0.5 ? 1 : m <= -0.5 ? 0 : 0.5) : m <= -0.5 ? 1 : m >= 0.5 ? 0 : 0.5;
      s += w * pF * htW;
    }
    return s;
  };

  const pHH = kvadrant("dom", "dom");
  const pHA = kvadrant("dom", "gost");
  const pAH = kvadrant("gost", "dom");
  const pAA = kvadrant("gost", "gost");

  const kombinacije = [
    { kod: "1/1", label: "Domaćin vodi na HT i pobjeđuje", p: pHH },
    { kod: "1/2", label: "Domaćin vodi na HT, gost pobjeđuje (preokret)", p: pHA },
    { kod: "2/1", label: "Gost vodi na HT, domaćin pobjeđuje (preokret)", p: pAH },
    { kod: "2/2", label: "Gost vodi na HT i pobjeđuje", p: pAA },
  ].map((k) => ({ ...k, ferOdd: k.p > 0.001 ? 1 / k.p : 9999 }));

  const preokreti =
    kombinacije.find((k) => k.kod === "1/2")!.p + kombinacije.find((k) => k.kod === "2/1")!.p;
  return {
    exp1H_H: Math.round(exp1H_H * 10) / 10,
    exp1H_A: Math.round(exp1H_A * 10) / 10,
    sigmaHT: Math.round(sigmaHT * 10) / 10,
    sigma2H: Math.round(sigma2H * 10) / 10,
    pHTHome,
    pHTDraw,
    pHTAway,
    kombinacije,
    konverzija: {
      home: pHTHome > 0.001 ? Math.min(1, pHH / pHTHome) : 0,
      away: pHTAway > 0.001 ? Math.min(1, pAA / pHTAway) : 0,
    },
    preokreti,
    razinaPreokreta: preokreti >= 0.2 ? "visoko" : preokreti >= 0.12 ? "srednje" : "nisko",
  };
}

/* ── RUKOMET ─────────────────────────────────────────────────────── */

export const RU_1H_DIO = 0.47; // udio golova u 1. poluvremenu
const RN = 40;

export type HtFtRukometIzlaz = {
  exp1H_H: number;
  exp1H_A: number;
  exp2H_H: number;
  exp2H_A: number;
  pHTHome: number;
  pHTDraw: number;
  pHTAway: number;
  kombinacije: { kod: string; label: string; p: number; ferOdd: number }[];
  konverzija: { home: number; away: number };
  preokreti: number;
  razinaPreokreta: "nisko" | "srednje" | "visoko";
  napomena: string;
};

/**
 * Rukomet HT/FT: 1H = 47% golova; golman-umor u 2H (+3% efikasnost
 * napada); tim koji zaostaje na HT tlači (×1.12), vodi drži (×0.92).
 */
export function htftRukomet(
  lamHome: number,
  lamAway: number,
  suspHome = 1,
  suspAway = 1,
): HtFtRukometIzlaz {
  // isključenja preko baznog (1) koštaju: vlastiti napad u 1H −0.12 gola,
  // protivnik +0.12 (suspenzije se više osjete u 1H kada je obrana svježa)
  const korekH = -(suspHome - 1) * 0.12 + (suspAway - 1) * 0.12;
  const korekA = -(suspAway - 1) * 0.12 + (suspHome - 1) * 0.12;
  const l1H = Math.max(3, lamHome * RU_1H_DIO + korekH);
  const m1H = Math.max(3, lamAway * RU_1H_DIO + korekA);
  // 2H: golman-umor → napadi efikasniji (+3%), ostatak golova
  const ostH = lamHome - lamHome * RU_1H_DIO;
  const ostA = lamAway - lamAway * RU_1H_DIO;
  const l2H0 = ostH * 1.03;
  const m2H0 = ostA * 1.03;

  // vlastiti grid s RN=14 — nogometni grid je rezan na 8 golova,
  // a rukomet ima ~14 golova po timu po poluvremenu!
  const g1H: number[][] = (() => {
    const g: number[][] = [];
    let z = 0;
    for (let h = 0; h <= RN; h++) {
      g[h] = [];
      for (let a = 0; a <= RN; a++) {
        const v = pois(h, l1H) * pois(a, m1H);
        g[h]![a] = v;
        z += v;
      }
    }
    for (let h = 0; h <= RN; h++) for (let a = 0; a <= RN; a++) g[h]![a] = g[h]![a]! / z;
    return g;
  })();

  // uvjetovani grid po HT stanju (normaliziran unutar stanja)
  const uvjet: Record<"1" | "X" | "2", number[][]> = {} as never;
  for (const s of ["1", "X", "2"] as const) {
    const g: number[][] = [];
    let zz = 0;
    for (let h = 0; h <= RN; h++) {
      g[h] = [];
      for (let a = 0; a <= RN; a++) {
        const ok = s === "1" ? h > a : s === "X" ? h === a : h < a;
        const v = ok ? (g1H[h]?.[a] ?? 0) : 0;
        g[h]![a] = v;
        zz += v;
      }
    }
    if (zz > 0)
      for (let h = 0; h <= RN; h++) for (let a = 0; a <= RN; a++) g[h]![a] = g[h]![a]! / zz;
    uvjet[s] = g;
  }

  const pHT: { "1": number; X: number; "2": number } = { "1": 0, X: 0, "2": 0 };
  for (let h = 0; h <= RN; h++)
    for (let a = 0; a <= RN; a++) {
      const p = g1H[h]?.[a] ?? 0;
      if (h > a) pHT["1"] += p;
      else if (h === a) pHT.X += p;
      else pHT["2"] += p;
    }

  // 2H dinamika po HT stanju
  // Aditivna dinamika (λ po poluvremenu je velik ~16 golova, pa se
  // multiplikatori bi pretjerano mjenjali): tlačeni tim +0.6 gola,
  // tim koji vodi −0.3 gola, remi → oba +0.1.
  const dyn: Record<"1" | "X" | "2", { h: number; a: number }> = {
    "1": { h: l2H0 - 0.3, a: m2H0 + 0.6 },
    X: { h: l2H0 + 0.1, a: m2H0 + 0.1 },
    "2": { h: l2H0 + 0.6, a: m2H0 - 0.3 },
  };

  const kombinacije: { kod: string; label: string; p: number; ferOdd: number }[] = [];
  const conv = { home: 0, away: 0 };
  for (const s of ["1", "X", "2"] as const) {
    const { h: lh, a: la } = dyn[s];
    const d: number[] = new Array(2 * RN + 1).fill(0);
    for (let h = 0; h <= RN; h++)
      for (let a = 0; a <= RN; a++) d[h - a + RN]! += pois(h, lh) * pois(a, la);
    const pFT: { "1": number; X: number; "2": number } = { "1": 0, X: 0, "2": 0 };
    const gu = uvjet[s];
    for (let hHT = 0; hHT <= RN; hHT++)
      for (let aHT = 0; aHT <= RN; aHT++) {
        const pUv = gu[hHT]?.[aHT] ?? 0;
        if (pUv <= 0) continue;
        const rHT = hHT - aHT;
        for (let dd = -RN; dd <= RN; dd++) {
          const w = d[dd + RN]!;
          if (w <= 0) continue;
          const rFT = rHT + dd;
          const ishod = rFT > 0 ? "1" : rFT === 0 ? "X" : "2";
          pFT[ishod]! += pUv * w;
        }
      }
    const mape: Record<"1" | "X" | "2", string[]> = {
      "1": ["1/1", "1/X", "1/2"],
      X: ["X/1", "X/X", "X/2"],
      "2": ["2/1", "2/X", "2/2"],
    };
    const labele: Record<string, string> = {
      "1/1": "Domaćin vodi i pobjeđuje",
      "1/X": "Domaćin vodi, remi na kraju",
      "1/2": "Domaćin vodi, gost pobjeđuje (preokret)",
      "X/1": "Remi na HT, domaćin pobjeđuje",
      "X/X": "Remi na HT i na kraju",
      "X/2": "Remi na HT, gost pobjeđuje",
      "2/1": "Gost vodi, domaćin pobjeđuje (preokret)",
      "2/X": "Gost vodi, remi na kraju",
      "2/2": "Gost vodi i pobjeđuje",
    };
    mape[s].forEach((kod, i) => {
      const f = (["1", "X", "2"] as const)[i]!;
      kombinacije.push({ kod, label: labele[kod]!, p: pHT[s] * pFT[f]!, ferOdd: 0 });
    });
    if (s === "1") conv.home = pFT["1"]!;
    if (s === "2") conv.away = pFT["2"]!;
  }

  const z = kombinacije.reduce((a, k) => a + k.p, 0);
  if (false && typeof (globalThis as any).__DBG !== "undefined")
    (globalThis as any).__DBG({ pHT, conv, p11: kombinacije.find((k) => k.kod === "1/1")!.p, z });
  for (const k of kombinacije) {
    k.p /= z || 1;
    k.ferOdd = k.p > 0.001 ? 1 / k.p : 9999;
  }
  kombinacije.sort((a, b) => b.p - a.p);

  const preokreti =
    kombinacije.find((k) => k.kod === "1/2")!.p + kombinacije.find((k) => k.kod === "2/1")!.p;

  return {
    exp1H_H: Math.round(l1H * 10) / 10,
    exp1H_A: Math.round(m1H * 10) / 10,
    exp2H_H: Math.round(l2H0 * 10) / 10,
    exp2H_A: Math.round(m2H0 * 10) / 10,
    pHTHome: pHT["1"],
    pHTDraw: pHT.X,
    pHTAway: pHT["2"],
    kombinacije,
    // conv.* je već UVJETNA vjerojatnost P(FT pobjeda | HT vodstvo)
    konverzija: {
      home: Math.min(1, Math.max(0, conv.home)),
      away: Math.min(1, Math.max(0, conv.away)),
    },
    preokreti,
    razinaPreokreta: preokreti >= 0.15 ? "visoko" : preokreti >= 0.09 ? "srednje" : "nisko",
    napomena:
      "1H = 47% golova · golman-umor 2H (+3%) · tlačenje zaostajeg tima (×1.12) · isključenja korigiraju 1H",
  };
}
