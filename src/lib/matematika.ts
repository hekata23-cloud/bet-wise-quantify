/* ============================================================
   MATEMATIKA.TS — profesionalni matematički sloj za sve kartice
   (Ensemble pooling · Dixon-Coles · Kalibracija prema kvotama ·
    Kelly kriterij · Brier/Log-loss za samopraćenje)

   CISTE FUNKCIJE — ne poziva API, ne treba ništa drugo.
   Ubaci u src/lib/matematika.ts i koristi iz bilo koje kartice.
   ============================================================ */

const EPS = 1e-9;

/* ---------- 1. POISSON + DIXON-COLES ----------
   Osnova svakog ozbiljnog nogometnog modela. Iz dva očekivana
   gola (domaći λ, gost μ) računa vjerojatnost SVAKOG rezultata,
   uz Dixon-Coles korekciju niskih rezultata (0-0, 1-0, 0-1, 1-1).
   rho = -0.05 je standardna empirijska vrijednost. */

export function poissonPMF(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  let fakt = 1;
  for (let i = 2; i <= k; i++) fakt *= i;
  logP -= Math.log(fakt);
  return Math.exp(logP);
}

function dcKorekcija(h: number, a: number, lam: number, mu: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lam * mu * rho;
  if (h === 0 && a === 1) return 1 + lam * rho;
  if (h === 1 && a === 0) return 1 + mu * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

export type MatricaRezultata = {
  matrica: number[][];      // matrica[domaciGolovi][gostujućiGolovi] = vj.
  maxGolova: number;
};

export function matricaRezultata(lam: number, mu: number, rho = -0.05, maxGolova = 10): MatricaRezultata {
  const m: number[][] = [];
  let zbroj = 0;
  for (let h = 0; h <= maxGolova; h++) {
    m[h] = [];
    for (let a = 0; a <= maxGolova; a++) {
      const p = poissonPMF(h, lam) * poissonPMF(a, mu) * dcKorekcija(h, a, lam, mu, rho);
      m[h][a] = Math.max(0, p);
      zbroj += m[h][a];
    }
  }
  for (let h = 0; h <= maxGolova; h++)
    for (let a = 0; a <= maxGolova; a++) m[h][a] /= zbroj || 1;
  return { matrica: m, maxGolova };
}

/* Iz matrice rezultata izvuči standardne tržišta: */
export function izMatrice(m: MatricaRezultata) {
  let p1 = 0, pX = 0, p2 = 0, bttsDa = 0, bttsNe = 0;
  for (let h = 0; h <= m.maxGolova; h++) {
    for (let a = 0; a <= m.maxGolova; a++) {
      const p = m.matrica[h][a];
      if (h > a) p1 += p; else if (h === a) pX += p; else p2 += p;
      if (h > 0 && a > 0) bttsDa += p; else bttsNe += p;
    }
  }
  return { p1, pX, p2, bttsDa, bttsNe };
}

/* Vjerojatnost da ukupno golova bude IZNAD linije (npr. 2.5): */
export function prekoLinije(m: MatricaRezultata, linija: number): number {
  let preko = 0;
  for (let h = 0; h <= m.maxGolova; h++)
    for (let a = 0; a <= m.maxGolova; a++)
      if (h + a > linija) preko += m.matrica[h][a];
  return preko;
}

/* ---------- 2. ENSEMBLE (vijeće modela) ----------
   Spaja više neovisnih procjena u jednu. Logaritamsko pooling
   (geometrijska sredina s težinama) je standard u profesionalnoj
   praksi — kažnjjava ekstremne jednostruke procjene.
   primjer: zdruzi([{p:0.62, tezina:2},{p:0.55, tezina:1}]) */

export type Procjena = { p: number; tezina?: number };

export function zdruzi(procjene: Procjena[]): number {
  const ciste = procjene.filter((x) => typeof x.p === "number" && isFinite(x.p) && x.p > 0 && x.p < 1);
  if (ciste.length === 0) return NaN;
  if (ciste.length === 1) return ciste[0].p;
  let logZ = 0, zbrojTezina = 0;
  for (const x of ciste) {
    const w = x.tezina && x.tezina > 0 ? x.tezina : 1;
    logZ += w * Math.log(x.p);
    zbrojTezina += w;
  }
  return Math.exp(logZ / zbrojTezina);
}

/* ---------- 3. KALIBRACIJA prema tržištu ----------
   Najvažniji korak točnosti. Ako tvoj model kaže p, a tržište
   (de-margina iz kvota) kaže pm, završna procjena je:
       p' = (n * p + m * pm) / (n + m)
   n = koliko vjeruješ svom modelu, m = koliko tržištu.
   Profesionalno: m >= n uvijek — tržište je pametnije od modela.
   Kad nema kvote, baznaStopa je povijesna učestalost (npr. BTTS ~52%). */

export function deMargina(k1: number, kX: number, k2: number): { p1: number; pX: number; p2: number } {
  const inv = [1 / k1, 1 / kX, 1 / k2].map((x) => Math.max(0, x));
  const z = inv.reduce((a, b) => a + b, 0) || 1;
  return { p1: inv[0] / z, pX: inv[1] / z, p2: inv[2] / z };
}

export function kalibriraj(
  pModel: number,
  trziste: number,      // de-margina vj. ili bazna stopa
  nModel = 1,           // koliko vjeruješ modelu (1 = malo, 3 = jako)
  mTrziste = 3          // koliko vjeruješ tržištu (ostavi >= nModel)
): number {
  if (!isFinite(pModel)) return trziste;
  const n = Math.max(0, nModel), m = Math.max(0, mTrziste);
  const p = (n * pModel + m * trziste) / (n + m || 1);
  return Math.min(0.99, Math.max(0.01, p));
}

/* ---------- 4. VALUE + KELLY kriterij ----------
   edge = očekivana vrijednost tipa. Kelly = optimalni udio uloga.
   Fractional Kelly (×0.25) je standard u praksi — puni Kelly je
   previše agresivan uz nesavršene procjene. */

export function edge(p: number, kvota: number): number {
  return p * kvota - 1;
}

export function kelly(p: number, kvota: number, frakcija = 0.25): number {
  const b = kvota - 1;
  if (b <= 0 || p <= 0 || p >= 1) return 0;
  const f = (p * (b + 1) - 1) / b;
  return Math.max(0, Math.min(0.25, f * frakcija)); // hard strop 25% banke
}

/* ---------- 5. SAMOPRAĆENJE (Brier + Log-loss) ----------
   Zovi ovo za svaki odlučeni tip. Niži = bolji model.
   Brier < 0.25 je bolji od nasumičnog pogađanja 1X2. */

export function brier(p: number, ishod: boolean): number {
  const o = ishod ? 1 : 0;
  return (p - o) * (p - o);
}

export function logLoss(p: number, ishod: boolean): number {
  const pc = Math.min(1 - EPS, Math.max(EPS, p));
  return ishod ? -Math.log(pc) : -Math.log(1 - pc);
}

/* Prosječna točnost na listi odlučenih tipova: */
export function ocjenaModela(tipovi: { p: number; pogodak: boolean }[]): {
  brier: number; logLoss: number; pogodci: number; n: number;
} {
  const cisti = tipovi.filter((t) => typeof t.p === "number" && isFinite(t.p));
  const n = cisti.length || 1;
  const br = cisti.reduce((s, t) => s + brier(t.p, t.pogodak), 0) / n;
  const ll = cisti.reduce((s, t) => s + logLoss(t.p, t.pogodak), 0) / n;
  return {
    brier: br,
    logLoss: ll,
    pogodci: cisti.filter((t) => t.pogodak).length,
    n: cisti.length,
  };
}
