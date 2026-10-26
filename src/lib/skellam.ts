/* ═══════════════════════════════════════════════════════════════════
   SKELLAM — egzaktni raspored gol-razlike + azijski handicap (v1)
   ═══════════════════════════════════════════════════════════════════
   Gol-razlika K = (golovi domaćina − golovi gosta) s nezavisnim
   Poisson golovima ima Skellamovu raspodjelu:

     P(K = k) = e^(−(λ1+λ2)) · (λ1/λ2)^(k/2) · I_|k|(2·√(λ1·λ2))

   Zašto je to bitno: azijski handicap je pitanje o RAZLIKI golova.
   Grid i normalna aproksimacija režu repove; Skellam je egzaktni
   odgovor — push (razlika = tačno linija) je vidljiv kao broj, a ne
   kao aproksimacija. Odatle dobivamo:

     • win / push / loss za bilo koju AH liniju (−2.0 … +2.0)
     • četvrtinske linije (−0.25, −0.75) kao pola uloga na susjednoj
       punoj i pola na polovičnoj liniji
     • PUSH RISK %: vjerojatnost da je razlika tačno na liniji
     • fer kvote preko sheme isplate (win o + push 1.0 = 1)

   Bez vanjskih ovisnosti — čisto, deterministički, SSR-safe.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Besselova funkcija prve vrste I_n(x), cijeli red ──
   I_n(x) = Σ_{m≥0} (x/2)^(2m+n) / (m! · (m+n)!)
   Računamo rekurzivno po članovima (stabilno za x ≤ ~30). */
export function besselI(n: number, x: number): number {
  const nn = Math.max(0, Math.abs(Math.round(n)));
  const pola = x / 2;
  // prvi član: pola^nn / nn!
  let clan = Math.exp(nn * Math.log(Math.max(pola, 1e-300)) - lgamma(nn + 1));
  let zbroj = clan;
  for (let m = 1; m < 200; m++) {
    clan *= (pola * pola) / (m * (m + nn));
    zbroj += clan;
    if (clan < zbroj * 1e-16) break;
  }
  return zbroj;
}

/* log-gama (Lanczos) — za nn! bez overflowa */
function lgamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0]!;
  for (let i = 1; i < g + 2; i++) x += c[i]! / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/* ── Skellam PMF ── */
export function skellamPmf(k: number, lam1: number, lam2: number): number {
  const kk = Math.abs(Math.round(k));
  if (lam1 <= 0 || lam2 <= 0) return k === 0 ? 1 : 0;
  const x = 2 * Math.sqrt(lam1 * lam2);
  return Math.exp(-(lam1 + lam2)) * Math.pow(lam1 / lam2, k / 2) * besselI(kk, x);
}

/* ── Skellam CDF: P(K ≤ k) — zbraja od −REP do k ──
   λ do 4.5 → |K| > 60 je zanemarljivo (< 1e-30). */
const REP = 60;
export function skellamCdf(k: number, lam1: number, lam2: number): number {
  const kg = Math.floor(k + 1e-9); // necjelobrojni k → P(K ≤ floor(k))
  let s = 0;
  for (let j = -REP; j <= kg; j++) s += skellamPmf(j, lam1, lam2);
  return s;
}

/* ── AZIJSKI HANDICAP preko Skellama ──
   `linija` = handicap dodan domaćinu (npr. −1.0, −1.5, +0.5, −0.25).
   Domaći ishod pokriva ako K + linija > 0. Push je K + linija = 0
   (moguć samo na cjelobrojnim linijama).
   Četvrtinske linije: pola uloga na linija−0.25, pola na linija+0.25. */
export type SkellamAhIshod = {
  win: number; // P(domaći pokriva)
  push: number; // PUSH RISK % — povrat uloga
  loss: number; // P(gost pokriva)
  ferWin: number; // fer kvota domaćeg (1 + loss/win, push-neutralizirana)
  ferLoss: number; // fer kvota gostujuće strane
};

export function ahSkellam(lam1: number, lam2: number, linija: number): SkellamAhIshod {
  const lin = Math.round(linija * 4) / 4;
  const djelovi: Array<{ l: number; tezina: number }> =
    Math.abs((lin * 4) % 2) === 1
      ? [
          { l: lin - 0.25, tezina: 0.5 },
          { l: lin + 0.25, tezina: 0.5 },
        ]
      : [{ l: lin, tezina: 1 }];

  let win = 0,
    push = 0,
    loss = 0;
  for (const d of djelovi) {
    // win: P(K > −l) = 1 − P(K ≤ −l)
    const w = 1 - skellamCdf(-d.l, lam1, lam2);
    const jeCijela = Math.abs((d.l * 2) % 2) < 1e-9;
    const p = jeCijela ? skellamPmf(-d.l, lam1, lam2) : 0;
    win += d.tezina * w;
    push += d.tezina * p;
    loss += d.tezina * (1 - w - p);
  }
  const ferWin = win > 1e-12 ? 1 + loss / win : Infinity;
  const ferLoss = loss > 1e-12 ? 1 + win / loss : Infinity;
  return { win, push, loss, ferWin, ferLoss };
}

/* ── GOL-LINIJA (Total) preko Poissonove raspodjele ukupno ──
   Ukupno T ~ Poisson(λ1+λ2); push na cjelobrojnim linijama. */
export type SkellamUkupnoIshod = {
  over: number;
  push: number;
  under: number;
  ferOver: number; // (1 − push) / over
};

export function skellamUkupnoOver(lam1: number, lam2: number, linija: number): SkellamUkupnoIshod {
  const lam = lam1 + lam2;
  const L = Math.round(linija * 2) / 2;
  const jeCijela = Math.abs((L * 2) % 2) < 1e-9;
  // P(T ≤ L) … P(T > L)
  let kum = 0;
  const gornja = jeCijela ? L : Math.floor(L);
  for (let j = 0; j <= gornja && j < 200; j++) kum += (Math.exp(-lam) * Math.pow(lam, j)) / fakt(j);
  const push = jeCijela ? (Math.exp(-lam) * Math.pow(lam, L)) / fakt(L) : 0;
  // kum = P(T <= L) VEĆ sadrži push (T = L je unutar kumulativa):
  // under = kum - push (strict ispod linije), over = 1 - kum → zbroj točno 1.
  const under = Math.max(0, kum - push);
  const over = Math.max(0, 1 - kum);
  const ferOver = over > 1e-12 ? (1 - push) / over : Infinity;
  return { over, push, under, ferOver };
}

function fakt(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/* ═══════════════════════════════════════════════════════════════════
   HAZARD MODEL — utjecaj ranih golova (0–20 min)
   ═══════════════════════════════════════════════════════════════════
   Ako UNDERDOG (tim s nižom pred-meč λ) da prvi gol u prvih 20 minuta,
   taktička ploča se otvara: favorit mora riskirati, underdog se brani
   niže — obje efektivne napadačke stope raste koeficijentom β = 1.18:

     λ_eff = β · λ  za OBA tima u tom scenariju

   U HT/FT motoru scenarij "underdog vodi" odgovara HT stanju 1 ili 2
   u kojem vodi slabiji tim; tamo se β množi s postojećom 2H dinamikom
   (tlačenje ×1.25 / držanje ×0.90) — ne zamjenjuje je.
   ═══════════════════════════════════════════════════════════════════ */

export const HAZARD_BETA = 1.18;

export type HazardScenarij = {
  prviGolUnderdog: boolean;
  /** minuta prvog gola — β vrijedi samo za 0–20 min */
  minuta: number;
};

export type HazardIzlaz = {
  lamDomEf: number;
  lamGostEf: number;
  beta: number;
  primijenjen: boolean;
};

export function hazardEfektivneLam(
  lamDom: number,
  lamGost: number,
  scenarij: HazardScenarij,
): HazardIzlaz {
  const rano = scenarij.minuta >= 0 && scenarij.minuta <= 20;
  const primijenjen = scenarij.prviGolUnderdog && rano;
  return {
    lamDomEf: primijenjen ? lamDom * HAZARD_BETA : lamDom,
    lamGostEf: primijenjen ? lamGost * HAZARD_BETA : lamGost,
    beta: HAZARD_BETA,
    primijenjen,
  };
}
