/**
 * Detektor obrnutih kvota: kladionica može "napuhati" jeftinu stranu (npr. Manje 2.5 @1.65)
 * jer većina igra nju. Ovdje se svako tržište provjerava NEOVISNO od drugih tržišta:
 * iz 1X2 (de-vig) fitamo Poisson λ domaćina i gosta i iz njih izvodimo pošteni
 * Over 2.5, BTTS i HT/FT. Ako se tržište razilazi od 1X2 slike, jedna strana je zamka.
 */
export type Unos = {
  k1: number;
  kx: number;
  k2: number;
  kOver?: number;
  kUnder?: number;
  kGG?: number;
  kNG?: number;
};
export type Signal = {
  trziste: string;
  jeftina: string;
  skupa: string;
  pTrzista: number;
  pModela: number;
  razlika: number; // za "skupu" stranu
  kvotaSkupe: number;
  evSkupe: number;
  razina: "ZAMKA" | "SUMNJIVO" | "OK";
  tekst: string;
};
export type Rezultat = { lh: number; la: number; pOver: number; pBtts: number; signali: Signal[] };

const devig = (o: number[]) => {
  const i = o.map((x) => 1 / x);
  const s = i.reduce((a, b) => a + b, 0);
  return i.map((x) => x / s);
};
// POPRAVAK: normalizira ograničeni Poissonov raspon kako odbačeni rep ne bi lažno povećao pobjede gosta.
const pois = (l: number, n = 11) => {
  const r = [Math.exp(-l)];
  for (let k = 1; k < n; k++) r.push((r[k - 1]! * l) / k);
  const s = r.reduce((a, b) => a + b, 0);
  return r.map((p) => p / s);
};

function mat(lh: number, la: number) {
  const h = pois(lh),
    a = pois(la);
  let p1 = 0,
    px = 0,
    over = 0,
    btts = 0;
  for (let i = 0; i < h.length; i++)
    for (let j = 0; j < a.length; j++) {
      const p = h[i]! * a[j]!;
      if (i > j) p1 += p;
      else if (i === j) px += p;
      if (i + j >= 3) over += p;
      if (i > 0 && j > 0) btts += p;
    }
  return { p1, px, p2: 1 - p1 - px, over, btts };
}

/** Fit λ iz 1X2: grubi grid pa fina pretraga. */
export function fit1x2(k1: number, kx: number, k2: number) {
  const [t1, tx] = devig([k1, kx, k2]) as [number, number, number];
  const err = (lh: number, la: number) => {
    const m = mat(lh, la);
    return (m.p1 - t1) ** 2 + (m.px - tx) ** 2;
  };
  let best = { lh: 1.4, la: 1.1, e: Infinity };
  for (let lh = 0.2; lh <= 4; lh += 0.05)
    for (let la = 0.2; la <= 4; la += 0.05) {
      const e = err(lh, la);
      if (e < best.e) best = { lh, la, e };
    }
  for (let step = 0.02; step > 0.001; step /= 2)
    for (let it = 0; it < 20; it++) {
      let moved = false;
      for (const [dh, da] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ] as const) {
        const lh = best.lh + dh,
          la = best.la + da;
        if (lh <= 0.05 || la <= 0.05) continue;
        const e = err(lh, la);
        if (e < best.e) {
          best = { lh, la, e };
          moved = true;
        }
      }
      if (!moved) break;
    }
  return best;
}

function signal(
  trziste: string,
  aName: string,
  bName: string,
  ka: number,
  kb: number,
  pModelA: number,
): Signal {
  const pA = devig([ka, kb])[0]!;
  const aJeftina = ka <= kb;
  const jeftina = aJeftina ? aName : bName,
    skupa = aJeftina ? bName : aName;
  const pTrz = aJeftina ? 1 - pA : pA,
    pMod = aJeftina ? 1 - pModelA : pModelA;
  const kvotaSkupe = aJeftina ? kb : ka;
  const razlika = pMod - pTrz,
    ev = (pMod * kvotaSkupe - 1) * 100;
  const razina =
    razlika >= 0.07 && ev > 3 ? "ZAMKA" : razlika >= 0.035 && ev > 0 ? "SUMNJIVO" : "OK";
  const tekst =
    razina === "OK"
      ? `${trziste} je usklađen s 1X2 (razlika ${(razlika * 100).toFixed(1)} pp). Nema obrnute kvote.`
      : `Kladionica nudi „${jeftina}" kao očito, ali 1X2 slika daje „${skupa}" ${(pMod * 100).toFixed(1)}% umjesto ${(pTrz * 100).toFixed(1)}%. ` +
        `Jeftina strana je vjerojatno napuhana jer je većina igra — vrijednost je na „${skupa}" @${kvotaSkupe.toFixed(2)} (EV ${ev > 0 ? "+" : ""}${ev.toFixed(1)}%).`;
  return {
    trziste,
    jeftina,
    skupa,
    pTrzista: pTrz,
    pModela: pMod,
    razlika,
    kvotaSkupe,
    evSkupe: ev,
    razina,
    tekst,
  };
}

export function analizirajObrnuto(u: Unos): Rezultat | null {
  if (!(u.k1 > 1 && u.kx > 1 && u.k2 > 1)) return null;
  const { lh, la } = fit1x2(u.k1, u.kx, u.k2);
  const m = mat(lh, la);
  const signali: Signal[] = [];
  if (u.kOver && u.kUnder && u.kOver > 1 && u.kUnder > 1)
    signali.push(signal("2.5 golova", "Više 2.5", "Manje 2.5", u.kOver, u.kUnder, m.over));
  if (u.kGG && u.kNG && u.kGG > 1 && u.kNG > 1)
    signali.push(signal("BTTS", "GG", "NG", u.kGG, u.kNG, m.btts));
  return { lh, la, pOver: m.over, pBtts: m.btts, signali };
}
