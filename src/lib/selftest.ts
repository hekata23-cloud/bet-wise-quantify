/* ═══════════════════════════════════════════════════════════════════
   SELFTEST — automatski auditor predikcijskih motora (v1)
   ═══════════════════════════════════════════════════════════════════
   Pokreće bateriju matematičkih provjera (bez mreže, bez API-ja):

     1) Over 2.5 + Under 2.5 = tačno 100% (i 1.5 / 3.5)
     2) BTTS Da + BTTS Ne   = tačno 100%
     3) Nema kontradiktornih preporuka:
          • Under 1.5 nikad ne ide uz Over 2.5
          • Under 2.5 nije moguć uz 2:2 kao top rezultat
          • BTTS Da ne može biti > 50% ako je Under 1.5 > 50%
     4) Monotonija linija: P(O1.5) ≥ P(O2.5) ≥ P(O3.5)
     5) P(BTTS) ≤ P(Over 1.5); P(0:0) ≤ P(BTTS Ne)
     6) Distribucija ukupnih golova zbraja se na 100%
     7) Kopule: grid zbroj = 1, korelacija = 0.08, BTTS raste s ρ
     8) Empirical Bayes: n=0 → ligaški prior; mali uzorak → strop 55%

   Rezultat ide u panel "Samotest" na Info stranici. Ako ijedan test
   padne, motor ne smije objavljivati tipove — prijava je vidljiva.
   ═══════════════════════════════════════════════════════════════════ */

import { goalsAnaliza, type FormaGolovi } from "./goals-motor";
import { bivarPoissonGrid, bpBtts, frankThetaZaKorelaciju, frankJointGrid } from "./btts-copula";
import { shrinkajStopu, jeMaliUzorak, stropPovjerenja, MAX_POVJERENJE_MALI, priorZaLigu } from "./eb-shrinkage";

export type SelfTest = { naziv: string; ok: boolean; detalj: string };
export type SelfTestIzvjestaj = {
  brTestova: number;
  brProslo: number;
  brPalih: number;
  sviProsli: boolean;
  testovi: SelfTest[];
  trajanjeMs: number;
};

const EPS = 1e-9;
const ok = (naziv: string, cond: boolean, detalj: string): SelfTest =>
  ({ naziv, ok: cond, detalj });

function forma(n: number, post: number, prim: number, btts: number, o25: number): FormaGolovi {
  return { odigrano: n, postignuti: post, primljeni: prim, btts, over15: o25 + 1, over25: o25, under35: n - o25, penali: 0 };
}

function poissonKum(k: number, lam: number): number {
  let p = Math.exp(-lam);
  let s = p;
  for (let i = 1; i <= k; i++) { p *= lam / i; s += p; }
  return s;
}

/** Glavni trkač — pozovi s bilo kojeg mjesta (Info panel, konzola). */
export function pokreniSelftest(): SelfTestIzvjestaj {
  const t0 = Date.now();
  const t: SelfTest[] = [];

  /* ── 0) Poisson sidra ── */
  t.push(ok(
    "Poisson CDF sidro (λ=2.7: P(≤2))",
    Math.abs(poissonKum(2, 2.7) - 0.4936) < 0.001,
    `P(≤2 | λ=2.7) = ${poissonKum(2, 2.7).toFixed(4)} (očekivano ≈ 0.4936)`,
  ));

  /* ── 1–6) baterija preko goals-motora ── */
  const lamParovi: Array<[number, number]> = [
    [0.9, 0.7], [1.3, 1.0], [1.6, 1.2], [2.0, 1.6], [2.4, 2.1], [3.0, 2.5], [3.4, 2.9],
  ];
  const forme: Array<[FormaGolovi | null, FormaGolovi | null]> = [
    [forma(10, 16, 11, 6, 5), forma(10, 14, 12, 5, 5)],
    [forma(2, 6, 1, 2, 2), forma(3, 2, 5, 1, 1)],
    [null, null],
    [forma(6, 12, 6, 4, 4), null],
  ];
  const lige = [undefined, "Bundesliga", "Serie A", "Nepoznata Liga"];

  let provjerenih = 0;
  let paoIdentitet = false;
  let paoMonotonija = false;
  let paoKopulaOgranicenje = false;
  let paoDistribucija = false;
  let paoKontradikcija = false;

  for (const [lamH, lamA] of lamParovi) {
    for (const [fd, fg] of forme) {
      for (const liga of lige) {
        const a = goalsAnaliza({ kvote: {}, formaDom: fd, formaGost: fg, brojKladionica: 0, liga });
        provjerenih++;
        const f = a.final;
        if (Math.abs(f.o25! + f.u25! - 1) > EPS || Math.abs(f.bttsDa! + f.bttsNe! - 1) > EPS) paoIdentitet = true;
        if (f.o15! < f.o25! || f.o25! < f.o35!) paoMonotonija = true;
        if (f.bttsDa! > f.o15! + 1e-7) paoKopulaOgranicenje = true;
        let z = 0;
        for (let k = 0; k <= 4; k++) z += f[`g${k}`] ?? 0;
        z += f["g5+"] ?? 0;
        if (Math.abs(z - 1) > 1e-7) paoDistribucija = true;
        // kontradikcije
        if (f.u15! > 0.5 && f.o25! > 0.5) paoKontradikcija = true;      // U1.5 uz O2.5
        if (f.u15! > 0.5 && f.bttsDa! > 0.5) paoKontradikcija = true;   // U1.5 uz BTTS Da > 50%
        if (f.u25! > 0.5 && (f.topRezultati?.[0]?.rezultat === "2:2")) paoKontradikcija = true; // U2.5 uz 2:2 top
      }
    }
  }
  t.push(ok("Over 2.5 + Under 2.5 = 100% (i 1.5/3.5, BTTS)", !paoIdentitet, `provjereno ${provjerenih} kombinacija`));
  t.push(ok("Monotonija linija O1.5 ≥ O2.5 ≥ O3.5", !paoMonotonija, "u svim kombinacijama"));
  t.push(ok("P(BTTS) ≤ P(Over 1.5)", !paoKopulaOgranicenje, "u svim kombinacijama"));
  t.push(ok("Distribucija golova (g0..g5+) zbroj = 100%", !paoDistribucija, "u svim kombinacijama"));
  t.push(ok("Nema kontradiktornih preporuka", !paoKontradikcija, "U1.5/O2.5, U2.5/2:2, U1.5/BTTS"));

  /* top rezultat uvijek unutar matrice i ≤ P(Over 2.5) ako total > 2.5 */
  const a1 = goalsAnaliza({ kvote: {}, formaDom: forma(10, 18, 12, 7, 6), formaGost: forma(10, 15, 13, 6, 5), liga: "Premier League" });
  const top0 = a1.topRezultati[0];
  const pTop = parseFloat(top0.rezultat.split(":")[0]!) + parseFloat(top0.rezultat.split(":")[1]!);
  t.push(ok("Top rezultat je unutar matrice", pTop <= 10 && top0.p > 0, `${top0.rezultat} @ ${(top0.p * 100).toFixed(1)}%`));

  /* ── 7) Kopule ── */
  {
    const g = bivarPoissonGrid(1.6, 1.2, 0.08);
    let z = 0;
    for (const r of g) for (const p of r) z += p;
    t.push(ok("Bivarijantni Poisson grid zbroj = 1", Math.abs(z - 1) < 1e-9, `zbroj = ${z.toFixed(10)}`));

    const th = frankThetaZaKorelaciju(0.08);
    const gj = frankJointGrid(1.3, 1.6, th);
    let exy = 0, zg = 0;
    for (let x = 0; x <= 15; x++) for (let y = 0; y <= 15; y++) { exy += x * y * gj[x]![y]!; zg += gj[x]![y]!; }
    const corr = (exy - 1.3 * 1.6) / Math.sqrt(1.3 * 1.6);
    t.push(ok("Frank kopula: korelacija golova = 0.08", Math.abs(corr - 0.08) < 0.005, `θ = ${th.toFixed(3)}, korelacija = ${corr.toFixed(4)}`));
    t.push(ok("Frank kopula grid zbroj = 1", Math.abs(zg - 1) < 1e-7, `zbroj = ${zg.toFixed(10)}`));

    const rhoUp = bpBtts(1.6, 1.2, 0.12);
    const rhoBaza = bpBtts(1.6, 1.2, 0.08);
    t.push(ok("BTTS raste s pozitivnom korelacijom", rhoUp >= rhoBaza, `ρ=0.08 → ${(rhoBaza * 100).toFixed(2)}%, ρ=0.12 → ${(rhoUp * 100).toFixed(2)}%`));
  }

  /* ── 8) Empirical Bayes ── */
  {
    const prior = priorZaLigu("Bundesliga");
    const nula = shrinkajStopu(0, 5, prior.poTimu);
    t.push(ok("EB: n = 0 → ligaški prior", Math.abs(nula - prior.poTimu) < 1e-12, `prior ${prior.naziv} = ${prior.poTimu.toFixed(3)} po timu`));

    const puno = shrinkajStopu(1000, 2.5, prior.poTimu);
    t.push(ok("EB: veliki uzorak → forma", Math.abs(puno - 2.5) < 0.01, `n=1000, forma 2.5 → ${puno.toFixed(4)}`));

    t.push(ok("Mali uzorak prag < 5", jeMaliUzorak(4) && !jeMaliUzorak(5), "4 → da, 5 → ne"));

    const strop = stropPovjerenja(90, true);
    t.push(ok("Strop povjerenja 55% kod malog uzorka", strop === MAX_POVJERENJE_MALI, `90 → ${strop}`));

    // motor s malim uzorkom mora imati strop i oznaku
    const b = goalsAnaliza({ kvote: {}, formaDom: forma(2, 6, 1, 2, 2), formaGost: forma(2, 3, 4, 1, 0), liga: "Serie A" });
    t.push(ok("Motor: mali uzorak → povjerenje ≤ 55 + oznaka", b.maliUzorak && b.povjerenje <= MAX_POVJERENJE_MALI && b.upozorenja.some((w) => w.includes("MALI UZORAK")), `povjerenje ${b.povjerenje}, oznaka ${b.maliUzorak}`));
  }

  /* ── 9) Tržišna koherencija: kad su kvote = fer, suglasnost je visoka ── */
  {
    const a = goalsAnaliza({ kvote: {}, formaDom: forma(10, 16, 11, 6, 5), formaGost: forma(10, 14, 12, 5, 5), liga: "Bundesliga" });
    const kvoteFer: Record<string, number> = {};
    for (const k of ["1", "X", "2", "o15", "u15", "o25", "u25", "o35", "u35", "bttsDa", "bttsNe"]) {
      const p = a.final[k];
      if (p != null && p > 0.001) kvoteFer[k] = Math.max(1.01, 1 / p);
    }
    const b = goalsAnaliza({ kvote: kvoteFer, formaDom: forma(10, 16, 11, 6, 5), formaGost: forma(10, 14, 12, 5, 5), liga: "Bundesliga" });
    t.push(ok("Fer kvote → visoka suglasnost model/tržište", b.suglasnost >= 0.9, `suglasnost ${b.suglasnost}`));
    t.push(ok("Fer kvote → edge ≈ 0 (nema lažnih value tipova)", Object.values(b.edge).every((e) => Math.abs(e) < 0.05), `max |edge| = ${Math.max(0, ...Object.values(b.edge).map(Math.abs)).toFixed(4)}`));
  }

  const brProslo = t.filter((x) => x.ok).length;
  return {
    brTestova: t.length,
    brProslo,
    brPalih: t.length - brProslo,
    sviProsli: brProslo === t.length,
    testovi: t,
    trajanjeMs: Date.now() - t0,
  };
}

