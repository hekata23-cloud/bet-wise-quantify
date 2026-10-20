/* ═══════════════════════════════════════════════════════════════════
   ANTI-LOSS ENGINE — "Smart Filter" i No-Bet / Skip logika
   ═══════════════════════════════════════════════════════════════════
   Što radi (čista logika, bez API-ja):
     1) Shannon entropija de-vigiranih 1X2 vjerojatnosti — ako je
        tržište gotovo uniformno (H > 0.88), utakmica je PREVISOKA
        volatilnost → SKIP, ne forsira se predikcija.
     2) Konflikt signala: modeli se ne slažu (grid vs Skellam),
        Monte Carlo odstupa > 10pp, nisko povjerenje → SKIP.
     3) Minimum Edge pravilo: GOLD / Value istaknut SAMO ako je
        matematički edge ≥ 5.0% nad de-vigiranim tržištem.
     4) Brier kalibracija — bilježi (p, ishod) i vraća povijesni
        hit-rate vs prosječno najavljenu vjerojatnost, pa ispravlja
        navedene posto (funkcija kalibriranaVjerojatnost).
   ═══════════════════════════════════════════════════════════════════ */

export type AntiLossStatus = "SKIP" | "GOLD" | "VALUE" | "STANDARD";

export type AntiLossVerdict = {
  status: AntiLossStatus;
  badge: string;
  badgeClass: string; // Tailwind klase za badge
  razlozi: string[];
  entropija: number | null; // 0..1 (normalizirana Shannon entropija)
  edgePct: number | null;
};

/** Shannon entropija normalizirana na 0..1 (1 = potpuna neodređenost). */
export function shannonEntropija(p: number[]): number {
  const xs = p.filter((x) => Number.isFinite(x) && x > 0);
  const s = xs.reduce((a, b) => a + b, 0);
  if (s <= 0 || xs.length < 2) return 0;
  let h = 0;
  for (const x of xs) {
    const px = x / s;
    h -= px * Math.log(px);
  }
  return h / Math.log(xs.length);
}

/** De-vigiranje 1X2: normaliziramo 1/kvota. Vraća null ako nema sve tri kvote. */
export function devig1x2(
  kv1?: number, kvX?: number, kv2?: number,
): { p1: number; pX: number; p2: number } | null {
  const raw = [kv1, kvX, kv2]
    .filter((k): k is number => k != null && Number.isFinite(k) && k > 1.01)
    .map((k) => 1 / k);
  if (raw.length < 3) return null;
  const s = raw[0]! + raw[1]! + raw[2]!;
  if (s <= 0) return null;
  return { p1: raw[0]! / s, pX: raw[1]! / s, p2: raw[2]! / s };
}

export type AntiLossUlaz = {
  /** kvote utakmice — koristi se za entropiju 1X2 */
  kvote?: Record<string, number>;
  /** edge glavnog tipa: p·kvota − 1 (0..1) */
  edge?: number | null;
  /** SARP ocjena povjerenja 0..100 */
  povjerenje?: number;
  /** koliko se modeli slažu (Skellam vs grid), 0..1 */
  suglasnostModela?: number;
  /** |MC − analitički model| na istom tržištu, 0..1 */
  mcVsModelRazlika?: number;
  /** oznaka teške rotacije kadra (ručno ili iz podataka) */
  rotacija?: boolean;
};

/** Minimum edge za GOLD / Value pick (spec: ≥ 5.0%). */
export const MIN_EDGE_GOLD = 0.05;
/** Entropija iznad koje je utakmica "high volatility — pass". */
export const MAX_ENTROPIJA = 0.88;

export function evaluirajAntiLoss(u: AntiLossUlaz): AntiLossVerdict {
  const razlozi: string[] = [];

  let entropija: number | null = null;
  const dv = u.kvote ? devig1x2(u.kvote["1"], u.kvote["X"], u.kvote["2"]) : null;
  if (dv) {
    entropija = shannonEntropija([dv.p1, dv.pX, dv.p2]);
    if (entropija > MAX_ENTROPIJA) {
      razlozi.push(
        `Visoka entropija ishoda (${Math.round(entropija * 100)}%) — tržište gotovo uniformno, nema stabilnog signala.`,
      );
    }
  }

  let sukob = false;
  if (u.suglasnostModela != null && u.suglasnostModela < 0.75) {
    sukob = true;
    razlozi.push("Konflikt signala: grid-model i Skellam provjera se ne slažu.");
  }
  if (u.mcVsModelRazlika != null && u.mcVsModelRazlika > 0.10) {
    sukob = true;
    razlozi.push("Monte Carlo odstupa više od 10pp od analitičkog modela.");
  }
  if (u.povjerenje != null && u.povjerenje < 45) {
    razlozi.push("Niska ocjena povjerenja (C) — premalo pouzdanih izvora podataka.");
  }
  if (u.rotacija) {
    razlozi.push("Oznaka teške rotacije kadra — nepredvidljiv sastav.");
  }

  const edgePct = u.edge != null && Number.isFinite(u.edge) ? u.edge * 100 : null;
  const skip = (entropija != null && entropija > MAX_ENTROPIJA) || sukob || u.rotacija === true;

  if (skip) {
    return {
      status: "SKIP",
      badge: "SKIP / HIGH VOLATILITY — PASS",
      badgeClass: "bg-red-500/15 text-red-300 border-red-500/40",
      razlozi: razlozi.length > 0 ? razlozi : ["Konflikt signala — predikcija ne prolazi anti-loss filter."],
      entropija,
      edgePct,
    };
  }

  if (edgePct != null && (u.edge ?? 0) >= MIN_EDGE_GOLD) {
    return {
      status: "GOLD",
      badge: "GOLD / VALUE PICK — edge ≥ 5%",
      badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
      razlozi, entropija, edgePct,
    };
  }

  if (edgePct != null && (u.edge ?? 0) >= 0.02) {
    return {
      status: "VALUE",
      badge: "VALUE — edge ≥ 2%",
      badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
      razlozi, entropija, edgePct,
    };
  }

  return {
    status: "STANDARD",
    badge: "STANDARD — bez istaknutog valuea",
    badgeClass: "bg-muted text-muted-foreground border-border",
    razlozi, entropija, edgePct,
  };
}

/* ───────────────────────── BRIER KALIBRACIJA ─────────────────────────
   Bilježi (p, ishod) u localStorage. Kalibracija = usporedba povijesnog
   hit-ratea s prosječno najavljenom vjerojatnosti, pa se navedene
   postokorigiraju prema stvarnoj preciznosti modela.
   Ključ: "pc.brier.v1", max 400 zapisa.
   ──────────────────────────────────────────────────────────────────── */

type BrierZapis = { p: number; ishod: 0 | 1; t: number };
const BRIER_KEY = "pc.brier.v1";
const MAX_ZAPISA = 400;

export function zapisiBrier(p: number, ishod: 0 | 1): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return;
  try {
    const raw = window.localStorage.getItem(BRIER_KEY);
    const arr: BrierZapis[] = raw ? JSON.parse(raw) : [];
    arr.push({ p: Math.min(0.99, Math.max(0.01, p)), ishod, t: Date.now() });
    window.localStorage.setItem(BRIER_KEY, JSON.stringify(arr.slice(-MAX_ZAPISA)));
  } catch {
    /* pun localStorage — preskoči */
  }
}

export type BrierKalibracija = {
  n: number;
  /** prosječni Brier score (0 = savršeno, 0.25 = moneta) */
  brier: number | null;
  /** stvarni hit-rate */
  hitRate: number | null;
  /** prosječno najavljena vjerojatnost */
  najavljeno: number | null;
};

export function brierKalibracija(): BrierKalibracija {
  if (typeof window === "undefined") return { n: 0, brier: null, hitRate: null, najavljeno: null };
  let arr: BrierZapis[] = [];
  try {
    const raw = window.localStorage.getItem(BRIER_KEY);
    arr = raw ? JSON.parse(raw) : [];
  } catch {
    arr = [];
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    return { n: 0, brier: null, hitRate: null, najavljeno: null };
  }
  const n = arr.length;
  const brier = arr.reduce((a, z) => a + (z.p - z.ishod) ** 2, 0) / n;
  const hitRate = arr.filter((z) => z.ishod === 1).length / n;
  const najavljeno = arr.reduce((a, z) => a + z.p, 0) / n;
  return { n, brier, hitRate, najavljeno };
}

/**
 * Kalibrirana vjerojatnost: pomak prema stvarnom hit-rateu modela.
 * Pomak je ograničen na ±8pp i teži s brojem zapisa (min 30 za punu težinu).
 */
export function kalibriranaVjerojatnost(p: number): number {
  const k = brierKalibracija();
  if (k.n < 10 || k.hitRate == null || k.najavljeno == null) return p;
  const tezina = Math.min(1, k.n / 30);
  let pomak = (k.hitRate - k.najavljeno) * tezina;
  pomak = Math.max(-0.08, Math.min(0.08, pomak));
  return Math.max(0.02, Math.min(0.98, p + pomak));
}

