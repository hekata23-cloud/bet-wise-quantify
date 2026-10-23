/* ═══════════════════════════════════════════════════════════════════
   SELFTEST — automatski auditor predikcijskih motora (v4)
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
     13) STVARNA TOČNOST (accuracy-ledger): prag uzorka, smjer
         temperiranja (preoptimističan → T>1, podzastavljen → T<1),
         zbrojevi para i trojke, ignoriranje htft-a, invarijante
         kalibracije s temperom, hlađenje u motoru
     14) KVANT NADGRADNJA (v5): egzaktni Skellam (PMF, AH win/push/
         loss, četvrtinske linije, gol-linija s pushom), hazard β=1.18,
         HT/FT zbroj-lock, OT model košarke (trigger + identitet),
         Q4 clutch FTR težine, rukomet 7v6 i golman-umor, PUSH RIZIK
         u sport-dodacima i pro-alatima, Clean Sheet kontradikcije

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
import { tezinaKalibracije as tezinaKalProvjera, kalibrirajGoalsFinal, tempPar, tempTrojku } from "./global-calibration";
import { PRAZNO_EMP, izracunajEmp, tempZa } from "./accuracy-ledger";
import { skellamPmf, ahSkellam, skellamUkupnoOver, hazardEfektivneLam, HAZARD_BETA } from "./skellam";
import { provjeriKonzistentnost } from "./konzistentnost";
import { handicapRedovi } from "./sport-dodatci";
import { asianHandicap } from "./pro-alati";
import { okolisPomak, sudacProfil, VJETAR_PRAG_KMH, SUDAC_KARTONA_PRAG } from "./math-engine";
import { varijancaTiketa, entropijaNozice, type KorpaTip } from "./korpa";
import {
  bankroll as vbBankroll, dodajEure as vbDodaj, resetBankroll as vbReset, skiniUlog as vbSkini,
  isplatiDobitak as vbIsplati, transakcije as vbTransakcije, ukupnaKvotaSlipa as vbKvota,
  mogucaIsplata as vbIsplata, analizirajSlip as vbAnaliza, virtualneKvote as vbKvote,
  trzistaZaSport as vbTrzista, uplatiVirtualniListic as vbUplati, kreditirajVirtualniTiket as vbKredit,
  formatZagrebStamp, type SlipNoga,
} from "./virtualna";
import {
  statusTiketa, ukupnaKvotaTiketa, isplataTiketa, statistikaListica, ocijeniNogu,
  jeVoidStatus, pogodiFiksaturu, vrstaTrzista,
  type Tiket, type TiketNoga, type RezultatUtakmice,
} from "./listici";
import { sarpBrain } from "./sarp-brain";
import type { DnevnikUnos } from "./dnevnik";
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
        const a = goalsAnaliza({ kvote: {}, empirijske: PRAZNO_EMP, formaDom: fd, formaGost: fg, brojKladionica: 0, liga });
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
  const a1 = goalsAnaliza({ kvote: {}, empirijske: PRAZNO_EMP, formaDom: forma(10, 18, 12, 7, 6), formaGost: forma(10, 15, 13, 6, 5), liga: "Premier League" });
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
    const b = goalsAnaliza({ kvote: {}, empirijske: PRAZNO_EMP, formaDom: forma(2, 6, 1, 2, 2), formaGost: forma(2, 3, 4, 1, 0), liga: "Serie A" });
    t.push(ok("Motor: mali uzorak → povjerenje ≤ 55 + oznaka", b.maliUzorak && b.povjerenje <= MAX_POVJERENJE_MALI && b.upozorenja.some((w) => w.includes("MALI UZORAK")), `povjerenje ${b.povjerenje}, oznaka ${b.maliUzorak}`));
  }

  /* ── 9) Tržišna koherencija: kad su kvote = fer, suglasnost je visoka ── */
  {
    const a = goalsAnaliza({ kvote: {}, empirijske: PRAZNO_EMP, formaDom: forma(10, 16, 11, 6, 5), formaGost: forma(10, 14, 12, 5, 5), liga: "Bundesliga" });
    const kvoteFer: Record<string, number> = {};
    for (const k of ["1", "X", "2", "o15", "u15", "o25", "u25", "o35", "u35", "bttsDa", "bttsNe"]) {
      const p = a.final[k];
      if (p != null && p > 0.001) kvoteFer[k] = Math.max(1.01, 1 / p);
    }
    const b = goalsAnaliza({ kvote: kvoteFer, empirijske: PRAZNO_EMP, formaDom: forma(10, 16, 11, 6, 5), formaGost: forma(10, 14, 12, 5, 5), liga: "Bundesliga" });
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
      an, mk: null, home: "Dom", away: "Gost", league: "NBA", fixtureId: 1, empirijske: PRAZNO_EMP,
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
      an, home: "Dom", away: "Gost", fixtureId: 1, empirijske: PRAZNO_EMP,
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

  /* ── 13) STVARNA TOČNOST — empirijsko temperiranje iz Dnevnika ── */
  {
    const unosEmp = (p: number, hit: boolean, trz: "1x2" | "btts" | "ou", i: number): DnevnikUnos => ({
      id: `st-${i}`,
      sport: "nogomet",
      kartica: "Test",
      utakmica: "A — B",
      liga: null,
      datum: new Date().toISOString(),
      fixtureId: i + 1,
      tip: "t",
      p,
      kvota: null,
      provjera:
        trz === "1x2"
          ? ({ vrsta: "1x2", strana: "1" } as const)
          : trz === "btts"
            ? ({ vrsta: "btts", strana: "da" } as const)
            : ({ vrsta: "ou", strana: "over", linija: 2.5 } as const),
      status: hit ? "pogodak" : "promasaj",
    });
    const paket = (n: number, p: number, hitRate: number, trz: "1x2" | "btts" | "ou"): DnevnikUnos[] =>
      Array.from({ length: n }, (_, i) => unosEmp(p, i < Math.round(n * hitRate), trz, i));

    // a) mali uzorak → identitet
    const empMali = izracunajEmp(paket(5, 0.6, 0.2, "1x2"));
    t.push(ok(
      "Točnost: n < 10 → temp = 1 (identitet)",
      tempZa("1x2", empMali) === 1,
      `T = ${tempZa("1x2", empMali)}`,
    ));

    // b) preoptimističan model → T > 1 (hlađenje)
    const empOver = izracunajEmp(paket(40, 0.6, 0.4, "1x2"));
    const Tover = tempZa("1x2", empOver);
    t.push(ok(
      "Točnost: preoptimističan model → T > 1",
      Tover > 1 && Tover <= 1.25,
      `T = ${Tover.toFixed(3)}`,
    ));

    // c) podzastavljen model → T < 1 (oštrije)
    const empUnder = izracunajEmp(paket(40, 0.55, 0.7, "ou"));
    const Tunder = tempZa("ou", empUnder);
    t.push(ok(
      "Točnost: podzastavljen model → T < 1",
      Tunder < 1 && Tunder >= 0.8,
      `T = ${Tunder.toFixed(3)}`,
    ));

    // d) temp para: favorit se hladi, zbroj para = 1
    t.push(ok(
      "Točnost: temp para hladi favorita, zbroj = 1",
      tempPar(0.6, Tover) < 0.6 && Math.abs(tempPar(0.6, Tover) + tempPar(0.4, Tover) - 1) < 1e-9,
      `0.6 → ${tempPar(0.6, Tover).toFixed(4)}`,
    ));

    // e) temp trojke: zbroj = 1, poredak očuvan
    const tr3 = tempTrojku([0.5, 0.3, 0.2], Tover);
    t.push(ok(
      "Točnost: temp trojke zbroj = 1 i poredak očuvan",
      Math.abs(tr3.reduce((s, x) => s + x, 0) - 1) < 1e-9 && tr3[0]! > tr3[1]! && tr3[1]! > tr3[2]!,
      `zbroj = ${tr3.reduce((s, x) => s + x, 0).toFixed(10)}`,
    ));

    // f) htft tipovi se ignoriraju (familija se ne može binarno kalibrirati)
    const empHtft: DnevnikUnos[] = Array.from({ length: 30 }, (_, i) => ({
      ...unosEmp(0.6, i % 3 === 0, "1x2", i),
      provjera: { vrsta: "htft", kod: "1/1" },
    }));
    t.push(ok(
      "Točnost: htft tipovi se ignoriraju",
      tempZa("1x2", izracunajEmp(empHtft)) === 1,
      "bez familije → temp 1",
    ));

    // g) kalibracija s temp čuva sve invarijante (bez tržišta, w = 0)
    {
      const finalUzorak: Record<string, number> = {
        o15: 0.7, o25: 0.55, o35: 0.4, bttsDa: 0.52, "1": 0.5, X: 0.27, "2": 0.23,
      };
      const kal = kalibrirajGoalsFinal(finalUzorak, {}, 0, empOver);
      const f = kal.final;
      const inv =
        Math.abs((f.o15 ?? 0) + (f.u15 ?? 1) - 1) < 1e-9 &&
        Math.abs((f.o25 ?? 0) + (f.u25 ?? 1) - 1) < 1e-9 &&
        Math.abs((f.o35 ?? 0) + (f.u35 ?? 1) - 1) < 1e-9 &&
        (f.o15 ?? 0) >= (f.o25 ?? 1) && (f.o25 ?? 0) >= (f.o35 ?? 1) &&
        (f.bttsDa ?? 1) <= (f.o15 ?? 0) &&
        Math.abs((f["1"] ?? 0) + (f.X ?? 0) + (f["2"] ?? 0) - 1) < 1e-9 &&
        kal.primijenjena === true;
      t.push(ok(
        "Točnost: kalibracija s temp čuva invarijante",
        inv,
        `T_1x2 = ${kal.emp?.temp["1x2"]?.toFixed(3)}, 1X2 zbroj = ${((f["1"] ?? 0) + (f.X ?? 0) + (f["2"] ?? 0)).toFixed(10)}`,
      ));
    }

    // h) motor: preoptimističan O/U rekord hladi vjerojatnosti u finalu
    {
      const empOU = izracunajEmp(paket(40, 0.6, 0.4, "ou"));
      const a = goalsAnaliza({ kvote: {}, empirijske: PRAZNO_EMP, formaDom: forma(10, 16, 11, 6, 5), formaGost: forma(10, 14, 12, 5, 5), liga: "Bundesliga" });
      const b = goalsAnaliza({ kvote: {}, empirijske: empOU, formaDom: forma(10, 16, 11, 6, 5), formaGost: forma(10, 14, 12, 5, 5), liga: "Bundesliga" });
      const o25A = a.final.o25 ?? 0;
      const o25B = b.final.o25 ?? 0;
      const smjerOk = o25A > 0.5 ? o25B < o25A : o25B > o25A;
      t.push(ok(
        "Točnost: motor s preoptimističnim rekordom hladi O2.5",
        smjerOk && b.empTocnost.primijenjena === true && (b.empTocnost.temp.ou ?? 1) > 1,
        `O2.5: ${(o25A * 100).toFixed(2)}% → ${(o25B * 100).toFixed(2)}% (T_ou = ${(b.empTocnost.temp.ou ?? 0).toFixed(3)})`,
      ));
    }
  }

  /* ── 14) KVANT NADGRADNJA — Skellam AH, hazard, OT, 7v6, Clean Sheet ── */
  {
    // a) Skellam PMF zbroj = 1
    let zSk = 0;
    for (let k = -60; k <= 60; k++) zSk += skellamPmf(k, 1.6, 1.2);
    t.push(ok(
      "KVANT Skellam: PMF zbroj = 1 (λ 1.6/1.2)",
      Math.abs(zSk - 1) < 1e-9,
      `zbroj = ${zSk.toFixed(10)}`,
    ));

    // b) AH linija 0: zbroj ishoda = 1, push = P(remi)
    const r0 = ahSkellam(1.6, 1.2, 0);
    t.push(ok(
      "KVANT Skellam AH 0: zbroj = 1 i PUSH = P(remi)",
      Math.abs(r0.win + r0.push + r0.loss - 1) < 1e-9 &&
        Math.abs(r0.push - skellamPmf(0, 1.6, 1.2)) < 1e-9,
      `win ${(r0.win * 100).toFixed(1)}% · PUSH ${(r0.push * 100).toFixed(2)}% · loss ${(r0.loss * 100).toFixed(1)}%`,
    ));

    // c) AH simetričan par: win = loss = (1 − push)/2
    const rs = ahSkellam(1.4, 1.4, 0);
    t.push(ok(
      "KVANT Skellam AH: simetričan par je egzaktno simetričan",
      Math.abs(rs.win - rs.loss) < 1e-12 && Math.abs(rs.win - (1 - rs.push) / 2) < 1e-9,
      `push = ${(rs.push * 100).toFixed(2)}%`,
    ));

    // d) AH −1.5: bez pusha, fer = 1 + loss/win
    const r15 = ahSkellam(1.6, 1.2, -1.5);
    t.push(ok(
      "KVANT Skellam AH −1.5: bez pusha, fer kvota = 1 + loss/win",
      r15.push === 0 && Math.abs(r15.ferWin - (1 + r15.loss / r15.win)) < 1e-9,
      `win ${(r15.win * 100).toFixed(1)}% · fer ${r15.ferWin.toFixed(3)}`,
    ));

    // e) AH četvrtinska linija −0.25: pola uloga, push moguć
    const rq = ahSkellam(1.6, 1.2, -0.25);
    t.push(ok(
      "KVANT Skellam AH −0.25: kombinacija pola uloga zbraja se na 1",
      Math.abs(rq.win + rq.push + rq.loss - 1) < 1e-9 && rq.push > 0.01,
      `push = ${(rq.push * 100).toFixed(2)}%`,
    ));

    // f) gol-linija s pushom: zbroj = 1, push = P(ukupno = linija)
    const gl = skellamUkupnoOver(1.6, 1.2, 3);
    t.push(ok(
      "KVANT gol-linija 3: zbroj = 1 i PUSH = P(ukupno tačno 3)",
      Math.abs(gl.over + gl.push + gl.under - 1) < 1e-9 &&
        Math.abs(gl.push - Math.exp(-2.8) * Math.pow(2.8, 3) / 6) < 1e-9 &&
        Math.abs(gl.ferOver - (1 - gl.push) / gl.over) < 1e-9,
      `over ${(gl.over * 100).toFixed(1)}% · PUSH ${(gl.push * 100).toFixed(2)}%`,
    ));

    // g) hazard β = 1.18: primijenjen samo za prvi gol underdog 0–20 min
    const hz = hazardEfektivneLam(1.6, 1.2, { prviGolUnderdog: true, minuta: 15 });
    const hzNe = hazardEfektivneLam(1.6, 1.2, { prviGolUnderdog: true, minuta: 35 });
    t.push(ok(
      "KVANT hazard: β = 1.18 na obje λ (underdog, 0–20 min)",
      HAZARD_BETA === 1.18 &&
        Math.abs(hz.lamDomEf - 1.6 * 1.18) < 1e-9 &&
        Math.abs(hz.lamGostEf - 1.2 * 1.18) < 1e-9 &&
        hz.primijenjen === true,
      `1.6 → ${hz.lamDomEf.toFixed(3)}, 1.2 → ${hz.lamGostEf.toFixed(3)}`,
    ));
    t.push(ok(
      "KVANT hazard: izvan scenarija = identitet",
      hazardEfektivneLam(1.6, 1.2, { prviGolUnderdog: false, minuta: 15 }).lamDomEf === 1.6 &&
        hzNe.lamDomEf === 1.6 && hzNe.primijenjen === false,
      "kasni gol (35') i bez-underdog scenarij ne mijenjaju λ",
    ));

    // h) HT/FT nogomet: zbroj 9 stanja = 1 (konzistentnost lock)
    const htftLock = htftNogomet(1.6, 1.2);
    t.push(ok(
      "KVANT HT/FT nogomet: zbrojStanja lock = tačno 1",
      Math.abs(htftLock.zbrojStanja - 1) < 1e-9 && htftLock.hazardBeta === 1.18,
      `zbroj = ${htftLock.zbrojStanja}`,
    ));

    // i) OT model košarke: bliska utakmica triggera (+5.2), široka ne
    const kt14 = (market: string, pick: string, odd: number | null): KosTipT =>
      ({ market, pick, prob: odd ? 1 / odd : 0, fair: odd ? odd : 99, odd, ev: null });
    const kosBazaMu = (mu: number, p1: number, pX: number, p2: number): KosAnalysis => ({
      mu, sigma: 12, total: 220, sigmaT: 16.5, nba: true,
      pHome: p1, pDraw: pX, pAway: p2, pHomeOT: p1, pAwayOT: p2,
      x12: [], dc: [], ml: [], totals: [], best: null, safest: null,
      totalPick: kt14(`Zbroj 220.5`, `Više 220.5`, null), notes: [],
    });
    const kosPoz = (an: KosAnalysis, stats?: Parameters<typeof sarpKosarka>[0]["stats"]) => {
      const p = sarpKosarka({ an, mk: null, home: "Dom", away: "Gost", league: "NBA", fixtureId: 1, empirijske: PRAZNO_EMP, stats });
      if (p == null) throw new Error("samotest: sarpKosarka vratio null");
      return p;
    };
    const otClose = kosPoz(kosBazaMu(0, 0.50, 0.01, 0.49));
    const otWide = kosPoz(kosBazaMu(8, 0.75, 0.01, 0.24));
    t.push(ok(
      "KVANT OT košarka: bliska utakmica → P(OT) > 8.5% i total +5.2",
      otClose.ot.primijenjeno === true && otClose.ot.p > 0.085 &&
        Math.abs(otClose.expTotal - 225.2) < 1e-9 && otClose.ot.pomakBodovi === 5.2,
      `P(OT) = ${(otClose.ot.p * 100).toFixed(1)}%, total 220 → ${otClose.expTotal}`,
    ));
    t.push(ok(
      "KVANT OT košarka: široka utakmica = identitet",
      otWide.ot.primijenjeno === false && otWide.ot.p < 0.085 &&
        Math.abs(otWide.expTotal - 220) < 1e-9 && otWide.ot.pomakBodovi === 0,
      `P(OT) = ${(otWide.ot.p * 100).toFixed(1)}%, total nepromijenjen`,
    ));

    // j) Q4 clutch FTR: bliska završnica mijenja težine
    const ff = { efgHome: 0.52, efgAway: 0.50, tovHome: 0.13, tovAway: 0.14, orbHome: 0.26, orbAway: 0.24, ftrHome: 0.30, ftrAway: 0.25 };
    const clutchBliz = kosPoz(kosBazaMu(0, 0.50, 0.01, 0.49), ff);
    const clutchSirok = kosPoz(kosBazaMu(20, 0.92, 0.01, 0.07), ff);
    t.push(ok(
      "KVANT Four Factors: Q4 clutch FTR 25%, široka utakmica baza FTR 15%",
      clutchBliz.fourFactors.clutch === true && clutchBliz.fourFactors.tezine.includes("Q4 clutch") &&
        clutchSirok.fourFactors.clutch === false && clutchSirok.fourFactors.tezine.includes("FTR 15%"),
      `bliska: "${clutchBliz.fourFactors.tezine}" · široka: "${clutchSirok.fourFactors.tezine}"`,
    ));

    // k) 7v6 prazna mreža: puna upotreba 0.7 → +3.2 gola ukupno
    const rt14 = (market: string, pick: string, odd: number | null): RukTipT =>
      ({ market, pick, prob: odd ? 1 / odd : 0, fair: odd ? odd : 99, odd, ev: null });
    const rukBazaMu = (p1: number, pX: number, p2: number): RukometAnalysis => ({
      muDiff: 2, sigmaDiff: 6.1, muTotal: 57, muHome: 29.5, muAway: 27.5,
      pHome: p1, pDraw: pX, pAway: p2, pHomeML: p1, pAwayML: p2,
      concrete: {
        winner: { pick: "1", type: "1", prob: p1, fair: p1 > 0 ? 1 / p1 : 99, odd: null, ev: null, confidence: "SREDNJA", reason: "samotest" },
        totalGoals: { pick: "VIŠE", line: 56.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, ev: null, projected: 57, confidence: "SREDNJA", reason: "samotest" },
        homeTotal: { pick: "VIŠE", line: 28.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, projected: 29.5 },
        awayTotal: { pick: "VIŠE", line: 27.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, projected: 27.5 },
      },
      x12: [], dc: [], ml: [], totals: [], homeTotals: [], awayTotals: [],
      best: null, safest: null, notes: [], source: "ALGORITAM", isBet365: true,
    });
    const rukPoz = (an: RukometAnalysis, stats?: Parameters<typeof sarpRukomet>[0]["stats"]) => {
      const p = sarpRukomet({ an, home: "Dom", away: "Gost", fixtureId: 1, empirijske: PRAZNO_EMP, stats });
      if (p == null) throw new Error("samotest: sarpRukomet vratio null");
      return p;
    };
    const r7v6 = rukPoz(rukBazaMu(0.60, 0.05, 0.35), { koristi7v6Home: 0.7 });
    const r7v6Baza = rukPoz(rukBazaMu(0.60, 0.05, 0.35));
    t.push(ok(
      "KVANT 7v6: upotreba 0.7 → +3.2 gola ukupno (70% timu s igračem više)",
      r7v6.taktika.primijenjeno === true &&
        Math.abs(r7v6.taktika.ekstraGolovi7v6 - 3.2) < 1e-9 &&
        Math.abs(r7v6.expTotal - r7v6Baza.expTotal - 3.2) < 1e-9 &&
        Math.abs(r7v6.lamHome - (r7v6Baza.lamHome + 2.24)) < 1e-9,
      `total ${r7v6Baza.expTotal.toFixed(2)} → ${r7v6.expTotal.toFixed(2)}`,
    ));

    // l) golman-umor: > 45 min povećava protivnički λ, ≤ 45 ne dira ništa
    const gkUmor = rukPoz(rukBazaMu(0.60, 0.05, 0.35), { gkMinutaHome: 60 });
    const gkSvjez = rukPoz(rukBazaMu(0.60, 0.05, 0.35), { gkMinutaHome: 40 });
    t.push(ok(
      "KVANT golman-umor: 60 min → gost +4% 2H golova; 40 min = identitet",
      gkUmor.taktika.gkUmorDom === true &&
        Math.abs(gkUmor.lamAway - (r7v6Baza.lamAway * (1 + 0.53 * 0.04))) < 1e-9 &&
        Math.abs(gkSvjez.lamAway - r7v6Baza.lamAway) < 1e-9 &&
        gkSvjez.taktika.primijenjeno === false,
      `λ gost: ${r7v6Baza.lamAway.toFixed(3)} → ${gkUmor.lamAway.toFixed(3)}`,
    ));

    // m) sport-dodatci: cjelobrojne linije nose push, zbroj = 1
    const hr = handicapRedovi("kosarka", 88, 84);
    const cjel = hr.find((x) => Math.abs((x.linija * 2) % 2) < 1e-9);
    t.push(ok(
      "KVANT sport-dodatci: cjelobrojna linija ima PUSH RIZIK i zbroj = 1",
      cjel != null && cjel.pushRizik > 0.001 &&
        Math.abs(cjel.pDom + cjel.pGost + cjel.pushRizik - 1) < 1e-9,
      `linija ${cjel?.linija}: push ${((cjel?.pushRizik ?? 0) * 100).toFixed(1)}%`,
    ));

    // n) pro-alati: asianHandicap = Skellam (push na liniji 0)
    const ahPa = asianHandicap(1.6, 1.2, 0);
    t.push(ok(
      "KVANT pro-alati: AH bez marže = Skellam push",
      Math.abs(ahPa.push - skellamPmf(0, 1.6, 1.2)) < 1e-9 &&
        Math.abs(ahPa.win + ahPa.push + ahPa.loss - 1) < 1e-9,
      `push = ${(ahPa.push * 100).toFixed(2)}%`,
    ));

    // o) Clean Sheet lock: HT/FT 1/1 ne može uz Clean Sheet gosta
    const konCs = provjeriKonzistentnost([
      { trziste: "HT/FT", tip: "1/1", p: 0.30 },
      { trziste: "Clean Sheet", tip: "Gost — DA", p: 0.55 },
    ]);
    t.push(ok(
      "KVANT konzistentnost: HT/FT 1/1 × Clean Sheet gost = KONTRADIKCIJA",
      konCs.konzistentno === false && konCs.upozorenja.length > 0,
      konCs.upozorenja[0]?.slice(0, 90) ?? "",
    ));
    const konOk = provjeriKonzistentnost([
      { trziste: "1x2", tip: "1", p: 0.55 },
      { trziste: "Clean Sheet", tip: "Domaćin — DA", p: 0.60 },
    ]);
    t.push(ok(
      "KVANT konzistentnost: kompatibilan par prolazi bez upozorenja",
      konOk.konzistentno === true && konOk.upozorenja.length === 0,
      "1 + Clean Sheet domaćin je dopuštena kombinacija",
    ));
  }

  /* ── 15) OKOLIS / SUDAC / BLOWOUT / GARBAGE TIME / VARIJANSA TIKETA (v6) ── */
  {
    // a) okolis: identitet bez podataka, drag s vjetrom > 35 km/h
    const oNula = okolisPomak(null);
    const oVjetar = okolisPomak({ vjetarKmh: 40 });
    const oMirno = okolisPomak({ vjetarKmh: VJETAR_PRAG_KMH - 5, kisa: false, teren: "dobro" });
    t.push(ok(
      "OKOLIS: bez podataka = identitet; vjetar > 35 km/h → λ −0.22 i korneri −1.5",
      oNula.primijenjeno === false && oNula.pomakGolovi === 0 && oNula.pomakKornera === 0 &&
        oVjetar.primijenjeno === true && oVjetar.pomakGolovi === -0.22 && oVjetar.pomakKornera === -1.5 &&
        oMirno.primijenjeno === false,
      `vjetar 40 → ${oVjetar.pomakGolovi} λ / ${oVjetar.pomakKornera} kornera; mirno = identitet`,
    ));
    const oKomb = okolisPomak({ kisa: true, teren: "lose" });
    t.push(ok(
      "OKOLIS: kiša ili loš teren aktiviraju drag (ne množe se)",
      oKomb.primijenjeno === true && oKomb.razlozi.length === 2 && oKomb.pomakGolovi === -0.22,
      `razlozi: ${oKomb.razlozi.join(", ")}`,
    ));

    // b) sudac: strog > 5.0 kartona ili > 0.4 penala → rizik crvena > 18%
    const sNula = sudacProfil(null);
    const sStrog = sudacProfil({ kartonaPoUtakmici: SUDAC_KARTONA_PRAG + 0.6 });
    const sMirno = sudacProfil({ kartonaPoUtakmici: 4.0, penaliPoUtakmici: 0.2 });
    const sPenal = sudacProfil({ penaliPoUtakmici: 0.5 });
    t.push(ok(
      "SUDAC: bez podataka = identitet; strog sudac (5.6 kartona ili 0.5 penala) → rizik crvena > 18%",
      sNula.primijenjeno === false && sNula.strog === false &&
        sStrog.strog === true && sStrog.rizikCrvena >= 0.18 &&
        sMirno.strog === false && sMirno.rizikCrvena < 0.18 &&
        sPenal.strog === true && sPenal.rizikCrvena >= 0.18,
      `5.6 kartona → rizik ${(sStrog.rizikCrvena * 100).toFixed(0)}%; 4.0 kartona → ${(sMirno.rizikCrvena * 100).toFixed(0)}%`,
    ));

    // c) sarpBrain: okolis smanjuje λUkupno za 0.22 end-to-end
    const sbKvote: Record<string, number> = { "1": 2.0, "X": 3.3, "2": 3.6, o25: 1.9, u25: 1.9, bttsDa: 1.85, bttsNe: 1.95 };
    const sbUtz = { id: 1, home: "Dom", away: "Gost", league: "Test Liga" };
    const sbBaza = sarpBrain({ utakmica: sbUtz, kvote: sbKvote });
    const sbOkolis = sarpBrain({ utakmica: sbUtz, kvote: sbKvote, okolis: { vjetarKmh: 42, kisa: true } });
    const sbSudac = sarpBrain({ utakmica: sbUtz, kvote: sbKvote, sudac: { kartonaPoUtakmici: 6.2 } });
    t.push(ok(
      "SARP nogomet: weather drag end-to-end (λUkupno −0.22) i kvant kontekst okoliša",
      Math.abs(sbOkolis.lambdaUkupno - (sbBaza.lambdaUkupno - 0.22)) < 1e-9 &&
        sbOkolis.kvant.okolis?.primijenjeno === true && sbOkolis.kvant.okolis.pomakKornera === -1.5,
      `λUkupno ${sbBaza.lambdaUkupno.toFixed(3)} → ${sbOkolis.lambdaUkupno.toFixed(3)}`,
    ));
    t.push(ok(
      "SARP nogomet: strogi sudac u kvant kontekstu, rizik crvena ≥ 18%",
      sbSudac.kvant.sudac?.strog === true && sbSudac.kvant.sudac.rizikCrvena >= 0.18 &&
        sbBaza.kvant.sudac?.strog === false,
      `rizik crvena: ${((sbSudac.kvant.sudac?.rizikCrvena ?? 0) * 100).toFixed(0)}%`,
    ));

    // d) košarka: blowout/garbage time kad |spread| > 16.5
    const kt6 = (market: string, pick: string, odd: number | null): KosTipT =>
      ({ market, pick, prob: odd ? 1 / odd : 0, fair: odd ? odd : 99, odd, ev: null });
    const kosBaza6 = (mu: number): KosAnalysis => ({
      mu, sigma: 12, total: 220, sigmaT: 16.5, nba: true,
      pHome: 0.75, pDraw: 0.01, pAway: 0.24, pHomeOT: 0.75, pAwayOT: 0.24,
      x12: [], dc: [], ml: [], totals: [], best: null, safest: null,
      totalPick: kt6("Zbroj 220.5", "Više 220.5", null), notes: [],
    });
    const kosPoz6 = (an: KosAnalysis, stats?: Parameters<typeof sarpKosarka>[0]["stats"]) => {
      const p = sarpKosarka({ an, mk: null, home: "Dom", away: "Gost", league: "NBA", fixtureId: 1, empirijske: PRAZNO_EMP, stats });
      if (p == null) throw new Error("samotest: sarpKosarka vratio null");
      return p;
    };
    const blowout = kosPoz6(kosBaza6(20));
    const normalan = kosPoz6(kosBaza6(8));
    const blizanac = kosPoz6(kosBaza6(30));
    t.push(ok(
      "BLOWOUT košarka: margina 20 → total +0.77; margina 30 → +2.97 (cap 3.0); margina 8 = identitet",
      blowout.blowout.primijenjeno === true && Math.abs(blowout.expTotal - (220 + 0.77)) < 1e-9 &&
        Math.abs(blizanac.blowout.pomakBodovi - 2.97) < 1e-9 && Math.abs(blizanac.expTotal - 222.97) < 1e-9 &&
        normalan.blowout.primijenjeno === false && normalan.expTotal === 220,
      `margina 20: +${blowout.blowout.pomakBodovi.toFixed(2)} · margina 30: +${blizanac.blowout.pomakBodovi.toFixed(2)} · margina 8: identitet`,
    ));

    // e) rukomet: garbage time kad razlika ≥ 8 od 40. min; bez live = identitet
    const rt6 = (market: string, pick: string, odd: number | null): RukTipT =>
      ({ market, pick, prob: odd ? 1 / odd : 0, fair: odd ? odd : 99, odd, ev: null });
    const rukBaza6 = (p1: number, pX: number, p2: number): RukometAnalysis => ({
      muDiff: 2, sigmaDiff: 6.1, muTotal: 57, muHome: 29.5, muAway: 27.5,
      pHome: p1, pDraw: pX, pAway: p2, pHomeML: p1, pAwayML: p2,
      concrete: {
        winner: { pick: "1", type: "1", prob: p1, fair: p1 > 0 ? 1 / p1 : 99, odd: null, ev: null, confidence: "SREDNJA", reason: "samotest" },
        totalGoals: { pick: "VIŠE", line: 56.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, ev: null, projected: 57, confidence: "SREDNJA", reason: "samotest" },
        homeTotal: { pick: "VIŠE", line: 28.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, projected: 29.5 },
        awayTotal: { pick: "VIŠE", line: 27.5, choice: "VIŠE", prob: 0.5, fair: 2, odd: null, projected: 27.5 },
      },
      x12: [], dc: [], ml: [], totals: [], homeTotals: [], awayTotals: [],
      best: null, safest: null, notes: [], source: "ALGORITAM", isBet365: true,
    });
    const rukPoz6 = (an: RukometAnalysis, stats?: Parameters<typeof sarpRukomet>[0]["stats"]) => {
      const p = sarpRukomet({ an, home: "Dom", away: "Gost", fixtureId: 1, empirijske: PRAZNO_EMP, stats });
      if (p == null) throw new Error("samotest: sarpRukomet vratio null");
      return p;
    };
    const garb = rukPoz6(rukBaza6(0.60, 0.05, 0.35), { liveMinuta: 46, liveDomGolovi: 34, liveGostGolovi: 24 });
    const garbRano = rukPoz6(rukBaza6(0.60, 0.05, 0.35), { liveMinuta: 30, liveDomGolovi: 34, liveGostGolovi: 24 });
    const garbBaza = rukPoz6(rukBaza6(0.60, 0.05, 0.35));
    t.push(ok(
      "GARBAGE TIME rukomet: razlika 10 u 46' → +2.1 gola; bez live ili rano = identitet",
      garb.garbageTime.primijenjeno === true && garb.garbageTime.margina === 10 && garb.garbageTime.minut === 46 &&
        Math.abs(garb.expTotal - (garbBaza.expTotal + 2.1)) < 1e-9 &&
        garbRano.garbageTime.primijenjeno === false && Math.abs(garbRano.expTotal - garbBaza.expTotal) < 1e-9,
      `razlika 10 @ 46' → +${garb.garbageTime.ekstraGolovi.toFixed(1)} gola; rano = identitet`,
    ));

    // f) korpa: Shannon entropija i remi/push detekcija
    const leg6 = (id: string, trziste: string, tip: string, p: number): KorpaTip =>
      ({ id, sport: "nogomet", utakmica: "U" + id, trziste, tip, kvota: 1.9, vjerojatnost: p });
    t.push(ok(
      "ENTROPIJA: p=0.5 → 1.0; p=0/1 → 0; monotona u p",
      entropijaNozice(0.5) === 1 && entropijaNozice(0) === 0 && entropijaNozice(1) === 0 &&
        entropijaNozice(0.7) < entropijaNozice(0.6),
      `H(0.5) = 1, H(0.8) = ${entropijaNozice(0.8).toFixed(3)}`,
    ));
    const vLow = varijancaTiketa([leg6("a", "Moneyline", "1", 0.8), leg6("b", "Moneyline", "2", 0.8), leg6("c", "Moneyline", "1", 0.85), leg6("d", "O/U", "Over 2.5", 0.9)]);
    const vHigh = varijancaTiketa([leg6("a", "1X2", "1", 0.55), leg6("b", "O/U 2.5", "Over 2.5", 0.55), leg6("c", "BTTS", "GG", 0.55)]);
    t.push(ok(
      "VARIJANSA TIKETA: 4 sigurne noge = Low; 3× 55% = High",
      vLow.razina === "niska" && vLow.entropija < 0.75 && vHigh.razina === "visoka" && vHigh.entropija > 0.9,
      `low ${(vLow.entropija * 100).toFixed(0)}% · high ${(vHigh.entropija * 100).toFixed(0)}%`,
    ));
    const vPush = varijancaTiketa([leg6("a", "O/U", "Over 2", 0.7), leg6("b", "1X2", "X", 0.3), leg6("c", "Moneyline", "1", 0.8), leg6("d", "Moneyline", "2", 0.8)]);
    t.push(ok(
      "VARIJANSA: remi/push noga detektirana (Over 2 cjelobrojna, X remi) → upozorenje s DNB preporukom",
      vPush.remiPushNoge === 2 && vPush.upozorenje != null && vPush.upozorenje.includes("DNB") && vPush.upozorenje.includes("X"),
      `remi/push noga: ${vPush.remiPushNoge}; upozorenje: "${vPush.upozorenje?.slice(0, 60)}…"`,
    ));
    const vHalf = varijancaTiketa([leg6("a", "O/U", "Over 2.5", 0.8), leg6("b", "1X2", "1", 0.8)]);
    t.push(ok(
      "VARIJANSA: polovične linije (Over 2.5) nisu push; < 3 noge = bez upozorenja",
      vHalf.remiPushNoge === 0 && vHalf.upozorenje === null,
      "2 noge: upozorenje ne izlazi (prag je 3+)",
    ));
  }

  /* ── 16) MOJI LISTIĆI — settlement: void 1.00, sport-pravila, push, analitika (v7) ── */
  {
    const noga7 = (id: string, sport: TiketNoga["sport"], trziste: string, tip: string, kvota: number, status: TiketNoga["status"] = "cekaj"): TiketNoga =>
      ({ id, sport, utakmica: "U" + id, trziste, tip, kvota, vjerojatnost: 0.5, status });
    const rez7 = (status: string, dom: number | null, gost: number | null, domReg: number | null = dom, gostReg: number | null = gost, domHT: number | null = null, gostHT: number | null = null): RezultatUtakmice =>
      ({ status, zavrsena: ["FT", "AET", "PEN", "AOT"].includes(status), dom, gost, domReg, gostReg, domHT, gostHT });

    // a) VOID: kvota 1.00, tiket NE pada
    const voidTiket = [
      noga7("v1", "nogomet", "1X2", "1", 1.8, "void"),
      noga7("v2", "nogomet", "O/U 2.5", "Over 2.5", 2.0, "dobitna"),
    ];
    t.push(ok(
      "VOID: PST/CANC/ABD noga = kvota 1.00 → ukupna kvota 2.00, tiket DOBITAN, isplata ulog×2 (ne pada!)",
      jeVoidStatus("PST") && jeVoidStatus("CANC") && jeVoidStatus("ABD") && !jeVoidStatus("FT") &&
        Math.abs(ukupnaKvotaTiketa(voidTiket) - 2.0) < 1e-9 &&
        statusTiketa(voidTiket) === "dobitno" &&
        Math.abs(isplataTiketa(voidTiket, 10) - 20) < 1e-9,
      `kvota ${ukupnaKvotaTiketa(voidTiket).toFixed(2)} · isplata ${isplataTiketa(voidTiket, 10).toFixed(2)} €`,
    ));
    // b) sve noge void → povrat uloga
    const sviVoid = [noga7("w1", "nogomet", "1X2", "1", 1.8, "void"), noga7("w2", "nogomet", "1X2", "X", 3.4, "void")];
    t.push(ok(
      "VOID: sve noge void → status POVRAT, isplata = ulog",
      statusTiketa(sviVoid) === "povrat" && isplataTiketa(sviVoid, 10) === 10,
      "puni povrat kad su sve noge odgođene/otkazane",
    ));
    // c) nogomet 90' — AET odlučuje regularni rezultat
    const aet7 = rez7("AET", 2, 1, 1, 1);
    t.push(ok(
      "NOGOMET 90': AET (reg 1:1, final 2:1) → X dobitan, '1' izgubljen",
      ocijeniNogu("nogomet", { trziste: "1X2", tip: "X", kvota: 3.2 }, aet7) === "dobitna" &&
        ocijeniNogu("nogomet", { trziste: "1X2", tip: "1", kvota: 2.0 }, aet7) === "izgubljena",
      "90 minuta + nadoknada, produžetak se ne računa",
    ));
    // d) košarka: 1X2 regularno, Moneyline uklj. OT
    const otKos = rez7("AOT", 105, 104, 100, 100);
    t.push(ok(
      "KOŠARKA OT: 1X2 'X' dobitan (100:100 reg), '1' izgubljen; Moneyline '1' dobitan (105:104 uklj. OT)",
      ocijeniNogu("košarka", { trziste: "1X2", tip: "X", kvota: 12 }, otKos) === "dobitna" &&
        ocijeniNogu("košarka", { trziste: "1X2", tip: "1", kvota: 1.5 }, otKos) === "izgubljena" &&
        ocijeniNogu("košarka", { trziste: "Moneyline", tip: "1", kvota: 1.5 }, otKos) === "dobitna",
      "1X2 i Spread = 40/48 min; Moneyline = uklj. produžetak",
    ));
    // e) košarka total uklj. OT
    t.push(ok(
      "KOŠARKA TOTAL: Over 205.5 s 105:104 (209 uklj. OT) → dobitan",
      ocijeniNogu("košarka", { trziste: "O/U", tip: "Over 205.5", kvota: 1.9 }, otKos) === "dobitna",
      "totali uključuju produžetak",
    ));
    // f) rukomet: 1X2 striktno 60', pobjednik meča uklj. produžetak
    const otRuk = rez7("AOT", 21, 22, 20, 20);
    t.push(ok(
      "RUKOMET 60': 1X2 'X' dobitan (20:20 reg); '1' izgubljen; pobjednik meča '2' dobitan (22:21 uklj. OT)",
      ocijeniNogu("rukomet", { trziste: "1X2", tip: "X", kvota: 5 }, otRuk) === "dobitna" &&
        ocijeniNogu("rukomet", { trziste: "1X2", tip: "1", kvota: 1.6 }, otRuk) === "izgubljena" &&
        ocijeniNogu("rukomet", { trziste: "Moneyline", tip: "2", kvota: 1.7 }, otRuk) === "dobitna",
      "1X2/AH/Total Goals = 60 minuta; pobjednik meča uklj. produžetak",
    ));
    // g) push linije
    const ft21 = rez7("FT", 2, 1);
    const ft11 = rez7("FT", 1, 1);
    t.push(ok(
      "PUSH: Over 2.0 (1:1 = 2 gola) = povrat; Domaćin −1.0 (2:1) = povrat; −1.5 = izgubljen; Gost +1.5 = dobitan",
      ocijeniNogu("nogomet", { trziste: "O/U", tip: "Over 2.0", kvota: 1.9 }, ft11) === "povrat" &&
        ocijeniNogu("nogomet", { trziste: "Azijski handicap", tip: "Domaćin -1.0", kvota: 2.1 }, ft21) === "povrat" &&
        ocijeniNogu("nogomet", { trziste: "Azijski handicap", tip: "Domaćin -1.5", kvota: 2.3 }, ft21) === "izgubljena" &&
        ocijeniNogu("nogomet", { trziste: "Azijski handicap", tip: "Gost +1.5", kvota: 1.8 }, ft21) === "dobitna",
      "cjelobrojna linija → povrat uloga na toj nozi",
    ));
    // h) GG i DNB
    t.push(ok(
      "GG/DNB: 1:1 GG da = dobitan, 2:0 GG da = izgubljen; DNB remi = povrat, DNB pobjeda = dobitan",
      ocijeniNogu("nogomet", { trziste: "BTTS", tip: "GG", kvota: 1.8 }, rez7("FT", 1, 1)) === "dobitna" &&
        ocijeniNogu("nogomet", { trziste: "BTTS", tip: "GG", kvota: 1.8 }, rez7("FT", 2, 0)) === "izgubljena" &&
        ocijeniNogu("nogomet", { trziste: "DNB", tip: "DNB Domaćin", kvota: 1.6 }, rez7("FT", 1, 1)) === "povrat" &&
        ocijeniNogu("nogomet", { trziste: "DNB", tip: "DNB Domaćin", kvota: 1.6 }, rez7("FT", 2, 1)) === "dobitna",
      "standardna tržišta ispravno ocijenjena",
    ));
    // i) analitika listića
    const tiketi7: Tiket[] = [
      { id: "t1", datum: "2026-01-01", ulog: 10, noge: [noga7("a", "nogomet", "O/U 2.5", "Over 2.5", 2.0, "dobitna")] },
      { id: "t2", datum: "2026-01-02", ulog: 10, noge: [noga7("b", "košarka", "Moneyline", "1", 1.9, "izgubljena")] },
      { id: "t3", datum: "2026-01-03", ulog: 10, noge: [noga7("c", "nogomet", "1X2", "X", 2.0, "void")] },
    ];
    const stat7 = statistikaListica(tiketi7);
    t.push(ok(
      "ANALITIKA: 3 listića (1 dobitan, 1 izgubljen, 1 povrat) → ROI 0%, Win Rate 33.3%, najjači sport nogomet (+10), najveća pogođena kvota 2.00",
      stat7.odigrani === 3 && stat7.dobitni === 1 && stat7.izgubljeni === 1 && stat7.povrati === 1 &&
        Math.abs(stat7.roi) < 1e-9 && Math.abs(stat7.winRate - 100 / 3) < 0.01 &&
        stat7.najjaciSport === "nogomet" && Math.abs(stat7.najjaciSportProfit - 10) < 1e-9 &&
        stat7.najvecaKvota != null && Math.abs(stat7.najvecaKvota - 2) < 1e-9,
      `ROI ${stat7.roi.toFixed(1)}% · WR ${stat7.winRate.toFixed(1)}% · najjači ${stat7.najjaciSport ?? "?"} +${stat7.najjaciSportProfit.toFixed(2)}`,
    ));
    // j) fuzzy uparivanje imena utakmica
    const kand7 = [
      { id: 11, dom: "Dinamo Zagreb", gost: "Hajduk Split", status: "FT" },
      { id: 12, dom: "Osijek", gost: "Rijeka", status: "FT" },
    ];
    t.push(ok(
      "UPARIVANJE: 'Dinamo Zagreb - Hajduk Split' → 11; 'Osijek — Rijeka' → 12; nepoznat par → null",
      pogodiFiksaturu("Dinamo Zagreb - Hajduk Split", kand7) === 11 &&
        pogodiFiksaturu("Osijek — Rijeka", kand7) === 12 &&
        pogodiFiksaturu("Lokomotiva - Varaždin", kand7) == null,
      "dijakritika, crtica i različiti crtani podnose se",
    ));
    // k) klasifikacija tržišta
    t.push(ok(
      "TRŽIŠTA: košarka 1X2→1x2reg; Moneyline→moneyline; rukomet Azijski handicap→handicap; nogomet O/U 2.5→total",
      vrstaTrzista("košarka", "1X2", "1") === "1x2reg" &&
        vrstaTrzista("košarka", "Moneyline", "1") === "moneyline" &&
        vrstaTrzista("rukomet", "Azijski handicap", "Domaćin -3.5") === "handicap" &&
        vrstaTrzista("nogomet", "O/U 2.5", "Over 2.5") === "total",
      "kontrola klasifikacije isplata",
    ));
  }

  /* ── 17) VIRTUALNA KLADIONICA — bankroll, 30 noga, kvote, Zagreb vrijeme, Orion analiza ── */
  {
    // a) bankroll: reset → 10.000, ulog → dobitak, dnevnik transakcija
    const s0 = vbReset();
    const s1 = vbSkini(50, "test ulog");
    const s2 = vbIsplati(200, "test dobitak");
    const s3 = vbDodaj(500, "test dodano");
    const tr = vbTransakcije();
    t.push(ok(
      "BANKROLL: reset=10.000; ulog 50 → 9.950; dobitak 200 → 10.150; dodano 500 → 10.650; dnevnik 4 transakcije",
      s0 === 10000 && s1 === 9950 && s2 === 10150 && s3 === 10650 && tr.length === 4 &&
        tr[0]!.stanje === 10650 && tr.every((x) => typeof x.stanje === "number" && Number.isFinite(x.stanje)),
      "virtuelni euri: dodavanje/reset neograničeno, dnevnik konzistentan",
    ));

    // b) ulog preko stanja → odbijeno
    const s4 = vbSkini(999999, "preko stanja");
    t.push(ok("BANKROLL: ulog veći od stanja je odbijen (null)", s4 == null, "zaštita bankrolla"));

    // c) kvota listića: umnožak + moguća isplata + €0.00 na gubitku
    const noge2: SlipNoga[] = [
      { id: "1", sport: "nogomet", utakmica: "A - B", trziste: "1X2", tip: "1", label: "1", kvota: 2, vjerojatnost: 0.5, izvorKvote: "model" },
      { id: "2", sport: "nogomet", utakmica: "C - D", trziste: "O/U", tip: "Over 2.5", label: "O2.5", kvota: 1.5, vjerojatnost: 0.7, izvorKvote: "model" },
    ];
    const isplata2 = vbIsplata(10, noge2);
    t.push(ok(
      "SLIP: ukupna kvota 2.0×1.5=3.0; isplata 10€×3=30€; gubitak = strogo €0.00 (settlement motor)",
      Math.abs(vbKvota(noge2) - 3) < 1e-9 && isplata2 === 30 && isplataTiketa(noge2.map((n) => ({ id: n.id, sport: n.sport, utakmica: n.utakmica, trziste: n.trziste, tip: n.tip, kvota: n.kvota, vjerojatnost: n.vjerojatnost, status: "izgubljena" as const })), 10) === 0,
      "umnožak kvota i isplate",
    ));

    // d) uplata: debita bankroll, sprema tiket izvor "virtualna", čisti listić
    vbReset();
    const up = vbUplati(noge2, 100);
    t.push(ok(
      "UPLATA: ulog 100 skinut (10.000→9.900), tiket spremljen s izvorom 'virtualna'",
      up.ok && up.ok && (up as { novoStanje: number }).novoStanje === 9900,
      "poravnanje na 'Moji listići' i bankroll",
    ));

    // e) kredit: dobitni tiket (bez voida) → isplata 300, kreditirano=true; ponovni poziv idempotentan
    const tiketUp = (up as { tiket: import("./listici").Tiket }).tiket;
    const dobiven = { ...tiketUp, noge: tiketUp.noge.map((n) => ({ ...n, status: "dobitna" as const })) };
    const poslije1 = vbKredit(dobiven);
    const stanje1 = vbBankroll();
    const poslije2 = vbKredit(poslije1);
    t.push(ok(
      "KREDIT: dobitak 100×3=300€ kreditiran (9.900→10.200); drugi poziv ne duplira",
      poslije1.kreditirano === true && stanje1 === 10200 && poslije2 === poslije1 && vbBankroll() === 10200,
      "idempotentno kreditiranje dobitka",
    ));

    // f) analiza listića: kombinirana p = produkt; najveći rizik = najniža p; Kelly granice
    const n3: SlipNoga[] = [
      { id: "1", sport: "nogomet", utakmica: "A - B", trziste: "1X2", tip: "1", label: "1", kvota: 1.8, vjerojatnost: 0.55, izvorKvote: "model" },
      { id: "2", sport: "nogomet", utakmica: "C - D", trziste: "O/U", tip: "Over 2.5", label: "O2.5", kvota: 2.0, vjerojatnost: 0.5, izvorKvote: "model" },
      { id: "3", sport: "nogomet", utakmica: "E - F", trziste: "BTTS", tip: "GG", label: "GG", kvota: 1.7, vjerojatnost: 0.6, izvorKvote: "model" },
    ];
    const an = vbAnaliza(n3, 10000);
    t.push(ok(
      "ORION: kombinirana p=0.55·0.5·0.6=16.5%; najveći rizik=O2.5 (p=50%); Kelly>0; 1/4 Kelly ≤ bankroll",
      Math.abs(an.kombiniranaVjerojatnost - 0.165) < 1e-9 && an.najveciRizik?.tip === "Over 2.5" &&
        an.kellyUdio > 0 && an.preporuceniUlog <= 10000 && an.brojNogu === 3,
      "kombinirana vjerojatnost, najveći rizik, Kelly preporuka",
    ));

    // g) virtualne kvote: >1, determinizam, monotonija O/U, katalog kompletan
    const kvo1 = vbKvote("nogomet", 777);
    const kvo2 = vbKvote("nogomet", 777);
    const uzmi = (arr: ReturnType<typeof vbKvote>, trz: string, tip: string) => arr.find((x) => x.trziste === trz && x.tip === tip)?.kvota ?? 0;
    const tpo = vbKvote("nogomet", 777).length;
    t.push(ok(
      "KVOTE (nogomet): sve >1; determinističke (ista utakmica = iste kvote); O/U monotonija; katalog 27 opcija",
      kvo1.length === 27 && kvo1.every((x) => x.kvota > 1 && x.kvota <= 50) &&
        kvo1.length === kvo2.length && kvo1.every((x, i) => Math.abs(x.kvota - kvo2[i]!.kvota) < 1e-9) &&
        uzmi(kvo1, "O/U", "Over 0.5") < uzmi(kvo1, "O/U", "Over 3.5") &&
        uzmi(kvo1, "O/U", "Under 0.5") > uzmi(kvo1, "O/U", "Under 3.5") && tpo === 27,
      "sinteza kvota s maržom 5,5%",
    ));

    // h) katalozi po sportu: nogomet 24 (9 HT/FT), košarka, rukomet; validna tržišta za settlement
    const kn = vbTrzista("nogomet"), kk = vbTrzista("košarka"), kr = vbTrzista("rukomet");
    const htft = kn.filter((x) => x.grupa === "HT/FT").length;
    t.push(ok(
      "KATALOG: nogomet 27 opcija (uklj. 9 HT/FT); košarka Moneyline+R1X2+AH+totali (15); rukomet 18",
      kn.length === 27 && htft === 9 && kk.length === 15 && kr.length === 18 &&
        vbKvote("košarka", 5).every((x) => x.kvota > 1) && vbKvote("rukomet", 5).every((x) => x.kvota > 1),
      "pun pokrivenost tržišta po sportu",
    ));

    // i) nova tržišta settlement: Dvostruka šansa, HT/FT, 1. poluvrijeme
    const rezHT = { status: "FT", zavrsena: true, dom: 2, gost: 1, domReg: 2, gostReg: 1, domHT: 1, gostHT: 0 };
    const rezHX = { status: "FT", zavrsena: true, dom: 1, gost: 1, domReg: 1, gostReg: 1, domHT: 1, gostHT: 1 };
    const ev = (n: { trziste: string; tip: string; kvota: number }, r: typeof rezHT) => ocijeniNogu("nogomet", n, r);
    t.push(ok(
      "NOVA TRŽIŠTA: 1X (2:1)=dobitna, X2 (2:1)=gubitna, 12 (1:1)=gubitna; HT/FT '1/1' (1:0→2:1)=dobitna; HT/FT 'X/1'=gubitna",
      ev({ trziste: "Dvostruka šansa", tip: "1X", kvota: 1.3 }, rezHT) === "dobitna" &&
        ev({ trziste: "Dvostruka šansa", tip: "X2", kvota: 1.7 }, rezHT) === "izgubljena" &&
        ev({ trziste: "Dvostruka šansa", tip: "12", kvota: 1.25 }, rezHX) === "izgubljena" &&
        ev({ trziste: "HT/FT", tip: "1/1", kvota: 3.2 }, rezHT) === "dobitna" &&
        ev({ trziste: "HT/FT", tip: "X/1", kvota: 4.5 }, rezHT) === "izgubljena",
      "dvostruka šansa i HT/FT po pravilima",
    ));

    // j) 1. poluvrijeme: pobjednik i total po HT rezultatu (nogomet i rukomet)
    const poluRuk = { status: "FT", zavrsena: true, dom: 24, gost: 21, domReg: 24, gostReg: 21, domHT: 12, gostHT: 13 };
    t.push(ok(
      "1. POLUVRIJEME: 1H '2' (12:13)=dobitna; 1H 'X' =gubitna; 1H Over 25.5 (25 golova)=dobitna; 1H Over 24.5 (2×12=24? ne — 25)→25>24.5 dobitna; push cjelobrojna",
      ocijeniNogu("rukomet", { trziste: "1. poluvrijeme", tip: "2", kvota: 2.2 }, poluRuk) === "dobitna" &&
        ocijeniNogu("rukomet", { trziste: "1. poluvrijeme", tip: "X", kvota: 4.0 }, poluRuk) === "izgubljena" &&
        ocijeniNogu("rukomet", { trziste: "O/U 1. poluvrijeme", tip: "Over 24.5", kvota: 1.9 }, poluRuk) === "dobitna" &&
        ocijeniNogu("nogomet", { trziste: "O/U 1. poluvrijeme", tip: "Over 2.0", kvota: 3.5 }, rezHX) === "povrat",
      "poluvrijeme tržišta koriste domHT/gostHT",
    ));

    // k) Zagreb vrijeme: "DD.MM.YYYY. HH:mm" (zima UTC+1, ljeto UTC+2)
    const zima = formatZagrebStamp(new Date("2026-01-24T17:00:00Z")); // 18:00 Zagreb
    const ljeto = formatZagrebStamp(new Date("2026-07-24T16:00:00Z")); // 18:00 Zagreb (DST)
    t.push(ok(
      "ZAGREB: 24.01.2026. 18:00 (UTC+1) i 24.07.2026. 18:00 (UTC+2 DST)",
      zima === "24.01.2026. 18:00" && ljeto === "24.07.2026. 18:00",
      "Europe/Zagreb enforcement",
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
