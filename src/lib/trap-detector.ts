// DETEKTOR ZAMKI I LAŽNIH FAVORITA
// Uspoređuje kvote kladionice (bez marže) s neovisnim Poisson modelom
// i upozorava kad "očiti" favorit (npr. Under 2.5 @1.65) skriva veliku šansu za suprotno.
import { calculateCorrectScore, type Inputs } from "./predictor-engine";

export const TRAP_EVENT = "andromeda:trap-inputs";

export interface Trap {
  market: string;
  favorite: string;
  favOdd: number;
  underdog: string;
  dogOdd: number;
  bookProb: number; // % bez marže za favorita
  modelProb: number; // % modela za autsajdera
  level: "OPREZ" | "ZAMKA";
  message: string;
  recommendation: string;
}

const num = (s?: string) => {
  const v = parseFloat(String(s ?? "").replace(",", "."));
  return isFinite(v) && v > 1 ? v : NaN;
};

function pois(l: number, k: number) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

function grid(lh: number, la: number) {
  const g: number[][] = [];
  let total = 0;
  for (let h = 0; h <= 8; h++) {
    g[h] = [];
    for (let a = 0; a <= 8; a++) {
      g[h][a] = pois(lh, h) * pois(la, a);
      total += g[h][a];
    }
  }
  // POPRAVAK: normaliziraj odrezanu Poissonovu matricu prije zbrajanja ishoda.
  if (total > 0) {
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) g[h][a] /= total;
    }
  }
  return g;
}

function sum(g: number[][], f: (h: number, a: number) => boolean) {
  let s = 0;
  g.forEach((r, h) =>
    r.forEach((p, a) => {
      if (f(h, a)) s += p;
    }),
  );
  return s;
}

/** Procjena očekivanih golova: iz modela prediktora, inače iz O/U i 1X2 kvota. */
function lambdas(i: Inputs): [number, number] | null {
  try {
    const cs = calculateCorrectScore(i, true) as {
      lambdaHome?: number;
      lambdaAway?: number;
      error?: string;
    };
    if (cs && !cs.error && cs.lambdaHome && cs.lambdaAway) return [cs.lambdaHome, cs.lambdaAway];
  } catch {
    /* nastavi */
  }
  const o = num(i.o25),
    u = num(i.u25);
  let total = 2.6;
  if (o && u) {
    const pO = 1 / o / (1 / o + 1 / u);
    // traži total čiji P(>2.5) odgovara tržištu
    let lo = 0.5,
      hi = 6;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      const p = 1 - (pois(m, 0) + pois(m, 1) + pois(m, 2));
      if (p < pO) lo = m;
      else hi = m;
    }
    total = (lo + hi) / 2;
  }
  const f1 = num(i.ft1),
    f2 = num(i.ft2);
  let share = 0.55;
  if (f1 && f2) share = Math.min(0.8, Math.max(0.2, 0.5 + (1 / f1 - 1 / f2) * 0.6));
  if (!(o && u) && !(f1 && f2)) return null;
  return [total * share, total * (1 - share)];
}

function check(
  market: string,
  aName: string,
  aOdd: number,
  bName: string,
  bOdd: number,
  modelA: number,
  out: Trap[],
) {
  if (!aOdd || !bOdd) return;
  const fav = aOdd <= bOdd;
  const [fN, fO, dN, dO] = fav ? [aName, aOdd, bName, bOdd] : [bName, bOdd, aName, aOdd];
  const dogModel = (fav ? 1 - modelA : modelA) * 100;
  const bookFav = (1 / fO / (1 / fO + 1 / dO)) * 100;
  const bookDog = 100 - bookFav;
  if (fO > 1.85) return; // nema izraženog favorita
  const edge = dogModel - bookDog;
  if (dogModel >= 45 || edge >= 8) {
    const level: Trap["level"] = dogModel >= 45 && edge >= 8 ? "ZAMKA" : "OPREZ";
    out.push({
      market,
      favorite: fN,
      favOdd: fO,
      underdog: dN,
      dogOdd: dO,
      bookProb: Math.round(bookFav),
      modelProb: Math.round(dogModel),
      level,
      message: `${fN} @${fO.toFixed(2)} izgleda sigurno, ali model daje ${dN} čak ${Math.round(dogModel)}% (kladionica samo ${Math.round(bookDog)}%).`,
      recommendation:
        level === "ZAMKA"
          ? `Ne igraj ${fN}. Vrijednost je na ${dN} @${dO.toFixed(2)} (manji ulog) ili preskoči tržište.`
          : `Smanji ulog na ${fN} ili ga ne stavljaj u kombinaciju.`,
    });
  }
}

export function analyzeTraps(i: Inputs | null): Trap[] {
  if (!i) return [];
  const l = lambdas(i);
  if (!l) return [];
  const g = grid(l[0], l[1]);
  const out: Trap[] = [];
  check(
    "Više/Manje 2.5",
    "Više 2.5",
    num(i.o25),
    "Manje 2.5",
    num(i.u25),
    sum(g, (h, a) => h + a > 2),
    out,
  );
  check(
    "Više/Manje 1.5",
    "Više 1.5",
    num(i.o15),
    "Manje 1.5",
    num(i.u15),
    sum(g, (h, a) => h + a > 1),
    out,
  );
  check(
    "Više/Manje 3.5",
    "Više 3.5",
    num(i.o35),
    "Manje 3.5",
    num(i.u35),
    sum(g, (h, a) => h + a > 3),
    out,
  );
  check(
    "GG/NG",
    "GG",
    num(i.bttsYes),
    "NG",
    num(i.bttsNo),
    sum(g, (h, a) => h > 0 && a > 0),
    out,
  );
  // 1X2: favorit protiv "ne-favorit" (X2 ili 1X)
  const f1 = num(i.ft1),
    fx = num(i.ftx),
    f2 = num(i.ft2);
  if (f1 && fx && f2) {
    const pHome = sum(g, (h, a) => h > a),
      pAway = sum(g, (h, a) => a > h);
    const x2 = 1 / (1 / fx + 1 / f2),
      x1 = 1 / (1 / fx + 1 / f1);
    if (f1 < f2) check("1X2", "1", f1, "X2", x2, pHome, out);
    else check("1X2", "2", f2, "1X", x1, pAway, out);
  }
  // HT/FT: niska kvota na 1 na poluvremenu dok je X na poluvremenu vjerojatan
  const h1 = num(i.ht1),
    hx = num(i.htx);
  if (h1 && hx && h1 < hx) {
    const hg = grid(l[0] * 0.45, l[1] * 0.45);
    check(
      "Poluvrijeme",
      "1 HT",
      h1,
      "X HT",
      hx,
      sum(hg, (h, a) => h > a),
      out,
    );
  }
  return out.sort((a, b) => b.modelProb - a.modelProb);
}

export function trapBriefing(i: Inputs | null): string {
  const t = analyzeTraps(i);
  const head =
    "═══ DETEKTOR ZAMKI (lažni favoriti) ═══\nPravilo: niska kvota (1.55–1.85) NIJE dokaz sigurnosti. Uvijek usporedi kvotu bez marže s modelom; ako suprotni ishod ima 40%+ šanse, upozori korisnika i ne preporučuj favorita kao siguran tip. Primijeni na O/U, GG/NG, 1X2 i HT/FT.";
  if (!t.length) return head;
  return `${head}\nOtkrivene zamke za zadnju učitanu utakmicu:\n${t.map((x) => `• [${x.level}] ${x.market}: ${x.message} → ${x.recommendation}`).join("\n")}`;
}
