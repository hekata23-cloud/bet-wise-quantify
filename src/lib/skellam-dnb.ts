// ============================================================
// SKELLAM-DNB — DNB i Asian Handicap (±0.25, ±0.5) iz Poisson λ
// Razlika golova D = X − Y (X~Pois(λh), Y~Pois(λa)) ima Skellamovu
// razdiobu. Iz nje računamo dobitak / povrat (push) / gubitak.
// ============================================================

export interface SkellamLinija {
  oznaka: string;      // "DNB 1", "AH 1 +0.25"…
  tim: "1" | "2";
  linija: number | null; // null = DNB
  win: number;         // P(puni dobitak) + ½·P(pola dobitka)
  push: number;        // P(povrat) (+ ½ za četvrt-linije)
  loss: number;        // P(gubitak) (+ ½ za četvrt-linije)
  noLoss: number;      // win + push → "sigurnost" noge
  ferKvota: number;    // poštena kvota uz povrat ((1 - push) / win)
}

function pois(l: number, n = 12): number[] {
  const r = [Math.exp(-l)];
  for (let k = 1; k < n; k++) r.push((r[k - 1]! * l) / k);
  const s = r.reduce((a, b) => a + b, 0);
  return r.map((p) => p / s);
}

/** P(D = d) za d ∈ [-11, 11]. */
export function skellam(lh: number, la: number): Map<number, number> {
  const h = pois(lh), a = pois(la);
  const out = new Map<number, number>();
  for (let i = 0; i < h.length; i++) for (let j = 0; j < a.length; j++) {
    const d = i - j;
    out.set(d, (out.get(d) ?? 0) + h[i]! * a[j]!);
  }
  return out;
}

function zbroj(sk: Map<number, number>, f: (d: number) => boolean) {
  let s = 0;
  for (const [d, p] of sk) if (f(d)) s += p;
  return s;
}

function linija(sk: Map<number, number>, tim: "1" | "2", h: number | null): SkellamLinija {
  const pd = (f: (d: number) => boolean) => zbroj(sk, (d) => f(tim === "1" ? d : -d));
  let win = 0, push = 0, loss = 0;
  if (h === null || h === 0) { win = pd((d) => d > 0); push = pd((d) => d === 0); loss = pd((d) => d < 0); }
  else if (h === 0.5) { win = pd((d) => d >= 0); loss = pd((d) => d < 0); }
  else if (h === -0.5) { win = pd((d) => d > 0); loss = pd((d) => d <= 0); }
  else if (h === 0.25) { const p0 = pd((d) => d === 0); win = pd((d) => d > 0) + p0 / 2; push = p0 / 2; loss = pd((d) => d < 0); }
  else if (h === -0.25) { const p0 = pd((d) => d === 0); win = pd((d) => d > 0); push = p0 / 2; loss = pd((d) => d < 0) + p0 / 2; }
  const oznaka = h === null ? `DNB ${tim}` : `AH ${tim} ${h > 0 ? "+" : ""}${h}`;
  return { oznaka, tim, linija: h, win, push, loss, noLoss: win + push, ferKvota: win > 0 ? (1 - push) / win : Infinity };
}

export const AH_LINIJE = [0.5, 0.25, -0.25, -0.5] as const;

/** Sve DNB + AH linije za oba tima. */
export function dnbAhTablica(lh: number, la: number): SkellamLinija[] {
  const sk = skellam(lh, la);
  const out: SkellamLinija[] = [];
  for (const tim of ["1", "2"] as const) {
    out.push(linija(sk, tim, null));
    for (const h of AH_LINIJE) out.push(linija(sk, tim, h));
  }
  return out;
}

/** "Bankroll builder": dobitak ≥ 78% (prava vjerojatnost), a DNB/AH linija ima nisku varijancu. */
export const SIGURNOST_PRAG = 0.78;
export function jeSigurnica(l: SkellamLinija): boolean {
  return l.win / Math.max(1e-9, 1 - l.push) >= SIGURNOST_PRAG;
}
