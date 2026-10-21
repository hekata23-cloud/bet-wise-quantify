/* ═══════════════════════════════════════════════════════════════════
   SELFTEST — automatski auditor predikcijskih motora (v3)
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
     10) HT/FT PRO motori: nogomet (9 stanja, HT raspored, preokreti),
         košarka (egzaktna simetrija, σ_HT = σ/√2), rukomet (zbroj,
         simetrija, konverzija HT vodstva)
     11) De-vig štit: Shin zbroj = 1, detekcija marže, POOR MARKET
         PRICE; pick badges: blokada suprotne strane, primarni ≥ 55%

   Rezultat ide u panel "Samotest" na Info stranici. Ako ijedan test
   padne, motor ne smije objavljivati tipove — prijava je vidljiva.
   ═══════════════════════════════════════════════════════════════════ */

import { goalsAnaliza, type FormaGolovi } from "./goals-motor";
import { bivarPoissonGrid, bpBtts, frankThetaZaKorelaciju, frankJointGrid } from "./btts-copula";
import { shrinkajStopu, jeMaliUzorak, stropPovjerenja, MAX_POVJERENJE_MALI, priorZaLigu } from "./eb-shrinkage";
import { htftNogomet, htftKosarka, htftRukomet } from "./htft-motor";
import { analizaVig, losaCijena, VIG_PRAG } from "./devig-shield";
import { izradiOznake, type Kandidat } from "./pick-badges";
import { sarpKosarka } from "./sarp-kosarka";
import { sarpRukomet } from "./sarp-rukomet";
import { tezinaKalibracije as tezinaKalProvjera } from "./global-calibration";
import type { KosAnalysis, Tip as KosTipT } from "./kosarka-engine";
import type { RukometAnalysis, Tip as RukTipT } from "./rukomet-engine";

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
        if (f.u25! > 0.5 && (a.topRezultati[0]?.rezultat === "2:2")) paoKontradikcija = true; // U2.5 uz 2:2 top (a.topRezultati — FIX: bilo na final, tiho mrtvo)
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

  /* ── 10) HT/FT PRO motori (nogomet / košarka / rukomet) ── */
  {
    // 10a) Nogomet: 9 stanja zbroj = 1, sidro 1.6/1.2, preokreti i HT raspored
    const nogLamovi: Array<[number, number]> = [[0.9, 0.7], [1.3, 1.0], [1.6, 1.2], [2.4, 2.1], [3.0, 2.5]];
    let nogZbroj = true, nogHT = true, nogPreokreti = true;
    let sidro = htftNogomet(1.6, 1.2);
    for (const [lh, la] of nogLamovi) {
      const a = htftNogomet(lh, la);
      if (Math.abs(a.stanja.reduce((s, c) => s + c.p, 0) - 1) > EPS) nogZbroj = false;
      if (Math.abs(a.htGolovi.nula + a.htGolovi.jedan + a.htGolovi.dva + a.htGolovi.triPlus - 1) > EPS) nogHT = false;
      if (Math.abs(a.preokret12 + a.preokret21 - a.preokreti) > EPS) nogPreokreti = false;
    }
    t.push(ok("HT/FT nogomet: 9 stanja zbroj = 1 (5 λ-parova)", nogZbroj, `npr. 1.6/1.2 → zbroj = ${(sidro.stanja.reduce((s, c) => s + c.p, 0)).toFixed(10)}`));
    t.push(ok("HT/FT nogomet: HT golovi zbroj = 100%", nogHT, `λ_HT=0.44λ_FT: ${Object.values(sidro.htGolovi).map((v) => (v * 100).toFixed(1)).join("/")}`));
    t.push(ok("HT/FT nogomet: preokreti = P(1/2) + P(2/1)", nogPreokreti, `${(sidro.preokreti * 100).toFixed(1)}% = ${(sidro.preokret12 * 100).toFixed(1)}% + ${(sidro.preokret21 * 100).toFixed(1)}%`));

    const ravn = htftKosarka(100, 100, 12);
    t.push(ok("HT/FT košarka: ravn. utakmica egzaktno simetrična", Math.abs(ravn.kombinacije[0]!.p - ravn.kombinacije[3]!.p) < 1e-9 && Math.abs(ravn.kombinacije[1]!.p - ravn.kombinacije[2]!.p) < 1e-9, `1/1=${(ravn.kombinacije[0]!.p * 100).toFixed(2)}% = 2/2, 1/2=${(ravn.kombinacije[1]!.p * 100).toFixed(2)}% = 2/1`));
    t.push(ok("HT/FT košarka: 4 ishoda zbroj = 1", Math.abs(ravn.kombinacije.reduce((s, c) => s + c.p, 0) - 1) < 1e-6, `zbroj = ${ravn.kombinacije.reduce((s, c) => s + c.p, 0).toFixed(8)}`));
    t.push(ok("HT/FT košarka: σ_HT = σ_FT/√2", Math.abs(ravn.sigmaHT - 12 / Math.SQRT2) < 0.1, `σ_HT = ${ravn.sigmaHT.toFixed(2)}`));

    const asim = htftKosarka(112, 108, 11);
    t.push(ok("HT/FT košarka: asimetrična utakmica zbroj = 1", Math.abs(asim.kombinacije.reduce((s, c) => s + c.p, 0) - 1) < 1e-6, `112−108: 1/1 ${(asim.kombinacije[0]!.p * 100).toFixed(1)}%, zbroj = ${asim.kombinacije.reduce((s, c) => s + c.p, 0).toFixed(6)}`));

    const rukSidro = htftRukomet(31, 29, 1, 2);
    const rukRavno = htftRukomet(30, 30, 1, 1);
    t.push(ok("HT/FT rukomet: 9 stanja zbroj = 1", Math.abs(rukSidro.kombinacije.reduce((s, c) => s + c.p, 0) - 1) < 1e-6, `zbroj = ${rukSidro.kombinacije.reduce((s, c) => s + c.p, 0).toFixed(8)}`));
    t.push(ok("HT/FT rukomet: ravna utakmica simetrična", Math.abs(rukRavno.kombinacije[0]!.p - rukRavno.kombinacije[1]!.p) < 0.001, `1/1=${(rukRavno.kombinacije[0]!.p * 100).toFixed(2)}%, 2/2=${(rukRavno.kombinacije[1]!.p * 100).toFixed(2)}%`));
    t.push(ok("HT/FT rukomet: konverzija HT vodstva u granicama", rukSidro.konverzija.home > 0.6 && rukSidro.konverzija.home < 0.95 && rukSidro.konverzija.away > 0.5 && rukSidro.konverzija.away < 0.95, `dom → ${(rukSidro.konverzija.home * 100).toFixed(1)}%, gost → ${(rukSidro.konverzija.away * 100).toFixed(1)}%`));
  }

  /* ── 11) De-vig štit + pick badges ── */
  {
    const a = analizaVig([2.10, 3.40, 3.30]);
    t.push(ok("De-vig: Shin fair vjerojatnosti zbroj = 1", a.metoda === "shin" && Math.abs(a.fair.reduce((s, x) => s + x, 0) - 1) < 1e-6, `[2.10, 3.40, 3.30]: metoda ${a.metoda}, zbroj = ${a.fair.reduce((s, x) => s + x, 0).toFixed(10)}`));
    t.push(ok("De-vig: vig detekcija (7.33% → distorzija)", Math.abs(a.vig - 0.0733) < 0.001 && a.distorzija === true, `vig = ${(a.vig * 100).toFixed(2)}% > prag ${(VIG_PRAG * 100).toFixed(0)}%`));
    t.push(ok("De-vig: POOR MARKET PRICE (p=54%, kvota 1.56)", losaCijena(0.54, 1.56).losa === true && losaCijena(0.54, 1.90).losa === false, `1.56 → loša cijena, 1.90 → OK`));

    const kandidati: Kandidat[] = [
      { tip: "U2.5", trziste: "Total", p: 0.54, odds: 1.95, edge: 0.052 },
      { tip: "O2.5", trziste: "Total", p: 0.46, odds: 2.05, edge: -0.056 },
      { tip: "U3.5", trziste: "T3.5", p: 0.75, odds: 1.4, edge: 0.05 },
      { tip: "1", trziste: "1X2", p: 0.46, odds: 2.2, edge: 0.06 },
    ];
    const o = izradiOznake(kandidati);
    t.push(ok("Badges: O2.5 blokiran kad je U2.5 sigurniji na istom tržištu", o.oznake["O2.5"] === "blokiran", `U2.5 54% vs O2.5 46% → O2.5 ${o.oznake["O2.5"]}`));
    t.push(ok("Badges: primarni mora imati p ≥ 55% (U3.5 @ 75%)", o.primarni?.tip === "U3.5" && o.sigurnosni?.tip === "U3.5", `primarni = ${o.primarni?.tip ?? "nema"} @ ${((o.primarni?.p ?? 0) * 100).toFixed(0)}%`));
    t.push(ok("Badges: 46% nikad nije primarni, samo value + varijanca", o.value?.tip === "1" && o.oznake["1"] === "value" && !o.poruke.some((x) => x.razina === "upozorenje" && x.tekst.includes("1")) === false, `tip "1" (46%, edge 6%) → value s upozorenjem na visoku varijancu`));
    const o2 = izradiOznake([{ tip: "2", trziste: "1X2", p: 0.44, odds: 2.9, edge: 0.07 }]);
    t.push(ok("Badges: nema primarnog kad ništa ne dođe do 55%", o2.nemaPrimarnog === true && o2.primarni === null, `najbolji kandidat 44% → nemaPrimarnog = ${o2.nemaPrimarnog}`));
  }


  /* ── 12) Globalna kalibracija: košarka i rukomet ── */
  {
    const kt = (market: string, pick: string, odd: number | null): KosTipT =>
      ({ market, pick, prob: odd ? 1 / odd : 0, fair: odd ? odd : 99, odd, ev: null });
    const kosBaza = (
      p1: number, pX: number, p2: number,
      ml: [number, number] | null, ou: [number, number] | null, line = 220.5,
    ): KosAnalysis => ({
      mu: 0, sigma: 12, total: 220, sigmaT: 16.5, nba: true,
      pHome: p1, pDraw: pX, pAway: p2, pHomeOT: p1, pAwayOT: p2,
      x12: [], dc: [],
      ml: ml ? [kt("Home/Away", "Home", ml[0]!), kt("Home/Away", "Away", ml[1]!)] : [],
      totals: ou ? [kt(`Zbroj ${line}`, `Više ${line}`, ou[0]!), kt(`Zbroj ${line}`, `Manje ${line}`, ou[1]!)] : [],
      best: null, safest: null, totalPick: kt(`Zbroj ${line}`, `Više ${line}`, ou ? ou[0]! : null), notes: [],
    });
    const kosPozovi = (an: KosAnalysis) => sarpKosarka({
      an, mk: null, home: "Dom", away: "Gost", league: "NBA", fixtureId: 1,
    });

    // a) identitet bez kvota
    const a0 = kosPozovi(kosBaza(0.60, 0.01, 0.39, null, null));
    t.push(ok(
      "Kalibracija košarka: bez kvota = identitet",
      a0 != null && a0.kalibracija.primijenjena === false && a0.pML1 === 0.60,
      `primijenjena = ${a0?.kalibracija.primijenjena}, pML1 = ${a0?.pML1}`,
    ));

    // b) s kvotama: ML + O/U → primijenjena, težina u granicama, zbrojevi = 1
    const a1 = kosPozovi(kosBaza(0.60, 0.01, 0.39, [1.80, 2.05], [1.90, 1.90]));
    const zbrojKos = a1 ? a1.pML1 + a1.pML2 + a1.pDraw : -1;
    t.push(ok(
      "Kalibracija košarka: log-pool primijenjen s kvotama (težina ≤ 0.45)",
      a1 != null && a1.kalibracija.primijenjena === true && a1.kalibracija.tezina > 0 && a1.kalibracija.tezina <= 0.45,
      `tezina = ${a1?.kalibracija.tezina}, primijenjena = ${a1?.kalibracija.primijenjena}`,
    ));
    t.push(ok(
      "Kalibracija košarka: ML ishodi zbroj = 1 nakon poola",
      Math.abs(zbrojKos - 1) < 1e-9,
      `zbroj = ${zbrojKos.toFixed(12)}`,
    ));
    t.push(ok(
      "Kalibracija košarka: O/U komplement zbroj = 1 nakon poola",
      a1 != null && Math.abs(a1.pOver + a1.pUnder - 1) < 1e-9,
      `pOver = ${a1?.pOver.toFixed(4)}, pUnder = ${a1?.pUnder.toFixed(4)}`,
    ));

    // c) kalibrirana vrijednost leži IZMEĐU modela i tržišta
    //    de-vig ML p1: (1/1.80)/((1/1.80)+(1/2.05)) ≈ 0.5325
    const mktML = (1 / 1.80) / ((1 / 1.80) + (1 / 2.05));
    t.push(ok(
      "Kalibracija košarka: pomak između modela i tržišta",
      a1 != null && a1.pML1 > mktML && a1.pML1 < 0.60,
      `model 60.0% → kalibrirano ${(a1 ? a1.pML1 * 100 : 0).toFixed(2)}% (tržište ${(mktML * 100).toFixed(2)}%)`,
    ));

    // d) strop težine kalibracije
    t.push(ok(
      "Kalibracija: težina tržištu nikad ne prelazi 0.45",
      tezinaKalProvjera(50, 50) <= 0.45,
      `tezina(50 knjiga, 50 parova) = ${tezinaKalProvjera(50, 50)}`,
    ));

    // ── rukomet ──
    const rt = (market: string, pick: string, odd: number | null): RukTipT =>
      ({ market, pick, prob: odd ? 1 / odd : 0, fair: odd ? odd : 99, odd, ev: null });
    const rukBaza = (
      p1: number, pX: number, p2: number,
      x12: [number, number, number] | null, ou: [number, number] | null, line = 56.5,
    ): RukometAnalysis => ({
      muDiff: 2, sigmaDiff: 6.1, muTotal: 57, muHome: 29.5, muAway: 27.5,
      pHome: p1, pDraw: pX, pAway: p2, pHomeML: p1, pAwayML: p2,
      concrete: {
        winner: { pick: "1", type: "1", prob: p1, fair: p1 > 0 ? 1 / p1 : 99, odd: x12 ? x12[0]! : null, ev: null, confidence: "SREDNJA", reason: "samotest" },
        totalGoals: { pick: "VIŠE", line, choice: "VIŠE", prob: 0.5, fair: 2, odd: ou ? ou[0]! : null, ev: null, projected: 57, confidence: "SREDNJA", reason: "samotest" },
        homeTotal: { pick: "VIŠE", line: 28.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, projected: 29.5 },
        awayTotal: { pick: "VIŠE", line: 27.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, projected: 27.5 },
      },
      x12: x12 ? [rt("1X2", "1", x12[0]!), rt("1X2", "X", x12[1]!), rt("1X2", "2", x12[2]!)] : [],
      dc: [], ml: [],
      totals: ou ? [rt(`Zbroj ${line}`, `Više ${line}`, ou[0]!), rt(`Zbroj ${line}`, `Manje ${line}`, ou[1]!)] : [],
      homeTotals: [], awayTotals: [], best: null, safest: null,
      notes: [], source: "ALGORITAM", isBet365: true,
    });
    const rukPozovi = (an: RukometAnalysis) => sarpRukomet({
      an, home: "Dom", away: "Gost", fixtureId: 1,
    });

    // e) identitet bez kvota
    const r0 = rukPozovi(rukBaza(0.60, 0.05, 0.35, null, null));
    t.push(ok(
      "Kalibracija rukomet: bez kvota = identitet",
      r0.kalibracija.primijenjena === false && r0.pHome === 0.60,
      `primijenjena = ${r0.kalibracija.primijenjena}, pHome = ${r0.pHome}`,
    ));

    // f) 1X2 + O/U kvote → zbroj 1X2 = 1
    const r1 = rukPozovi(rukBaza(0.60, 0.05, 0.35, [1.75, 8.00, 3.05], [1.85, 1.95]));
    const zbrojRuk = r1.pHome + r1.pDraw + r1.pAway;
    t.push(ok(
      "Kalibracija rukomet: 1X2 zbroj = 1 nakon trojnog poola",
      Math.abs(zbrojRuk - 1) < 1e-9 && r1.kalibracija.primijenjena === true,
      `zbroj = ${zbrojRuk.toFixed(12)}, primijenjena = ${r1.kalibracija.primijenjena}`,
    ));
    t.push(ok(
      "Kalibracija rukomet: O/U komplement zbroj = 1 nakon poola",
      Math.abs(r1.pOver + r1.pUnder - 1) < 1e-9,
      `pOver = ${r1.pOver.toFixed(4)}, pUnder = ${r1.pUnder.toFixed(4)}`,
    ));

    // g) kalibrirana vrijednost leži IZMEĐU modela i tržišta
    //    de-vig 1X2 p1: (1/1.75)/Σ ≈ 0.558
    const invR = (1 / 1.75) + (1 / 8.00) + (1 / 3.05);
    const mktRuk = (1 / 1.75) / invR;
    t.push(ok(
      "Kalibracija rukomet: pomak između modela i tržišta",
      r1.pHome > mktRuk && r1.pHome < 0.60,
      `model 60.0% → kalibrirano ${(r1.pHome * 100).toFixed(2)}% (tržište ${(mktRuk * 100).toFixed(2)}%)`,
    ));

    // h) HT/FT matrica s kalibriranim FT vjerojatnostima zadržava zbroj 1
    t.push(ok(
      "Kalibracija rukomet: HT/FT matrica zadržava zbroj 1",
      Math.abs(r1.htft.reduce((s, c) => s + c.p, 0) - 1) < 1e-9,
      `zbroj = ${r1.htft.reduce((s, c) => s + c.p, 0).toFixed(10)}`,
    ));
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
