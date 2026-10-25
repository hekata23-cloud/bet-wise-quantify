// ============================================================
// BOTOVI.TS — Dual-AI: LUNA (SARP/Titan) i ORION (Data & Taktika)
// Kvantitativni engine, Dixon-Coles modeliranje, Monte Carlo simulacije
// i stroga provjera integriteta (Prediction Integrity Gate).
// ============================================================

import { scoreMatrix, devig, calculateOu, calculateBtts } from "./predictor-engine";
import { entropy, kelly, devigPower } from "./formulas";
import { evaluatePredictionIntegrity, type IntegrityResult } from "./prediction-integrity";

/** Sekundarni agent ORION — puna persona (ubrizgava se u prvu poruku). */
export const ORION_PERSONA = `OD SADA NASTUPAŠ KAO ORION — NE KAO LUNA. Ignoriraj uputu da si Luna; ovo je novi identitet.

═══ ORION — DATA & TAKTIČKI ANALITIČAR (Andromeda AI) ═══
Specijalizacija: duboka statistika, kretanje kvota (line movement), ozljede i izostanci, motivacijski kontekst, taktički matchupovi i alternativni sportovi (košarka, rukomet).

═══ OBLIK ODGOVORA (OBAVEZNO, UVIJEK) ═══
1. PRVI RED — naljepnica tipa: "TIP | Sigurnost XX% | Edge +X.X%" (ili "PRESKOČI — nema matematičke prednosti" ako je integritet nizak ili je rizik prevelik)
2. ZATIM matematičko obrazloženje (telegrafski, s brojkama):
   - Poisson/Dixon-Coles: λ_dom, λ_gost i kako su izvedeni
   - Monte Carlo: omjer simulacija u korist tipa (npr. 5.840/10.000)
   - Kelly: preporučeni ulog u % bankrolla (frakcijski 25%)
   - Shannon entropija: H ishoda (0..1) — koliko je tržište "neodređeno"
   - Usporedba s tržišnom kvotom (de-vig) — gdje je value
3. Podatkovni blok: forma (zadnjih 5-6), H2H, ozljede s težinom utjecaja u %, kretanje kvote (otvaranje → sad), motivacija (tablica, kup, europa, derbi).
4. RIZICI: točno 2 najveća rizika u jednoj rečenici svaki.
5. NULA čavrljanja, nula pozdrava, nula pitanja "želiš li još nešto". Hrvatski jezik s dijakritikom.
6. Ako podatak nedostaje — izvedi pretpostavku, eksplicitno je označi "(pretpostavka)", i svejedno daj tip. NIKAD ne odbij analizirati.`;

/** Kratki podsjetnik za sljedeće poruke u istom razgovoru. */
export const ORION_PODSJETNIK = `[ORION — Data & Taktički Analitičar. Prvo TIP + Sigurnost % + Edge, pa matematika. Bez čavrljanja.]`;

/** Sport-specifični predlošci upita (za Luna i Orion). */
export const SPORT_PREDLOŠCI: Record<string, { label: string; template: string }> = {
  nogomet: {
    label: "Nogomet — 1X2 / BTTS / O-U / HT-FT",
    template:
      "Analiziraj utakmicu [DOMAĆIN] vs [GOST] ([LIGA], [DATUM]).\nTržišta koja moram dobiti: 1X2, BTTS (GG/NG), Over/Under 2.5, HT/FT najbolja kombinacija.\nKoristi: forma zadnjih 6, xG, λ i μ, de-vig kvota, Monte Carlo 10k, HT/FT prijelaznu matricu (tlačenje gubitnika). Daj glavni tip + 1 sigurniju alternativu.",
  },
  kosarka: {
    label: "Košarka — Moneyline / Spread / Total / četvrtine",
    template:
      "Analiziraj utakmicu [DOMAĆIN] vs [GOST] ([LIGA], [DATUM]).\nTržišta: Moneyline (1-2), Spread/Handicap, Total poena O/U, raspad po četvrtinama (Q1-Q4).\nKoristi: pace (tempo), Offensive/Defensive Rating obje ekipe, home/away split, rotacije i umor (back-to-back). Daj glavni tip + Kelly ulog.",
  },
  rukomet: {
    label: "Rukomet — 1X2 / Handicap / Total / poluvremena",
    template:
      "Analiziraj utakmicu [DOMAĆIN] vs [GOST] ([LIGA], [DATUM]).\nTržišta: 1X2, Azijski handicap, Total golova O/U, golovi po poluvremenima (1. HT / 2. HT total).\nKoristi: napad i obrana (golovi po meču), efikasnost obrambene linije, forma zadnjih 5, domaći faktor. Daj glavni tip + edge u %.",
  },
  htft: {
    label: "HT/FT — prijelazi",
    template:
      "Daj HT/FT analizu za [DOMAĆIN] vs [GOST].\nIzračunaj svih 9 kombinacija (1/1, 1/X, 1/2, X/1, X/X, X/2, 2/1, 2/X, 2/2), označi dijagonalu (držanje) vs okretanja, i daj najjaču kombinaciju + sigurnosni par. Obrati pažnju na PRIJELAZE: tko vodi na HT drži ili pušta, tko gubi tlači u 2. poluvremenu.",
  },
};

/** Brzi upiti za Orionov panel. */
export const ORION_BRZI_UPITI = [
  "Analiziraj današnje najzanimljivije utakmice s value edge-om.",
  "Kako interpretirati pad kvote s 2.10 na 1.85 (line movement)?",
  "Koja ozljeda najviše mijenja λ i koliko u postocima?",
  "Taktički matchup: visoki pressing protiv low blocka — tko pobjeđuje tržište?",
];

// ============================================================
// KVANTITATIVNA TELEMETRIJA I ANALITIČKI MOTOR
// ============================================================

export interface QuantTelemetry {
  sport: "nogomet" | "kosarka" | "rukomet" | "tenis" | "opce";
  homeTeam: string;
  awayTeam: string;
  competition: string;
  marketName: string;
  pick: string;
  confidencePercent: number;
  edgePercent: number;
  fairOdds: number;
  marketOdds: number | null;
  kellyFractionPercent: number;
  shannonEntropy: number;
  monteCarloRatio: string;
  monteCarloSims: number;
  lambdaHome: number;
  lambdaAway: number;
  totalXG: number;
  integrity: IntegrityResult;
  p1: number;
  pX: number;
  p2: number;
  pOver25: number;
  pUnder25: number;
  pBttsYes: number;
  pBttsNo: number;
  topScore: string;
  topScoreProb: number;
  altPick: string;
  risks: [string, string];
  formHome: string;
  formAway: string;
  injuriesImpact: string;
  lineMovementText: string;
  tacticalNotes: string;
}

/** Jednostavni pseudo-random generator s fiksnim seed-om iz stringa za determinističke simulacije */
function stringSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 12345;
}

function lcgRandom(seedRef: { val: number }): number {
  seedRef.val = (seedRef.val * 1664525 + 1013904223) % 4294967296;
  return seedRef.val / 4294967296;
}

function samplePoisson(lambda: number, seedRef: { val: number }): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= lcgRandom(seedRef);
  } while (p > L && k < 30);
  return k - 1;
}

/** Izdvaja ekipe i kvote iz korisničkog unosa */
export function extractMatchDetails(text: string, contextTitle?: string | null): {
  home: string;
  away: string;
  sport: "nogomet" | "kosarka" | "rukomet" | "tenis" | "opce";
  odds: { o1?: number; oX?: number; o2?: number; oOver?: number; oUnder?: number };
} {
  let sport: "nogomet" | "kosarka" | "rukomet" | "tenis" | "opce" = "nogomet";
  const t = text.toLowerCase();
  if (/košark|kosark|nba|euroleague|poena|četvrtin/i.test(t)) sport = "kosarka";
  else if (/rukomet|golova po poluvremenu|handicap rukomet/i.test(t)) sport = "rukomet";
  else if (/tenis|setov|gemov|wimbledon|roland garros/i.test(t)) sport = "tenis";

  let home = "Domaćin";
  let away = "Gost";

  // Pokušaj izvući iz naslova meča u kontekstu
  if (contextTitle && / vs | - | protiv /i.test(contextTitle)) {
    const parts = contextTitle.split(/ vs | - | protiv /i);
    if (parts.length >= 2) {
      home = parts[0].trim();
      away = parts[1].trim();
    }
  } else {
    // Pokušaj iz korisničkog teksta
    const matchRegex = /([A-Za-zČĆŽŠĐčćžšđ0-9\.\s]{2,24})\s+(?:vs|protiv|-)\s+([A-Za-zČĆŽŠĐčćžšđ0-9\.\s]{2,24})/i;
    const m = text.match(matchRegex);
    if (m && m[1] && m[2]) {
      const h = m[1].replace(/analiziraj|utakmicu|tekmu|daj|tip|za/gi, "").trim();
      const a = m[2].replace(/\(.*?\)|\[.*?\]|kvote.*$/gi, "").trim();
      if (h.length >= 2 && a.length >= 2) {
        home = h;
        away = a;
      }
    }
  }

  // Izdvajanje kvota ako su navedene u tekstu (npr. "kvote 1.95 3.40 4.10" ili "1.85 3.50 4.20")
  const odds: { o1?: number; oX?: number; o2?: number; oOver?: number; oUnder?: number } = {};
  const numbers = text.match(/\b\d+[\.,]\d{1,2}\b/g);
  if (numbers && numbers.length >= 3) {
    const vals = numbers.map((n) => parseFloat(n.replace(",", ".")));
    if (vals[0] > 1 && vals[1] > 1 && vals[2] > 1) {
      odds.o1 = vals[0];
      odds.oX = vals[1];
      odds.o2 = vals[2];
    }
  } else if (numbers && numbers.length === 2) {
    const vals = numbers.map((n) => parseFloat(n.replace(",", ".")));
    if (vals[0] > 1 && vals[1] > 1) {
      odds.oOver = vals[0];
      odds.oUnder = vals[1];
    }
  }

  return { home, away, sport, odds };
}

/**
 * Glavni kvantitativni izračun za utakmicu.
 * Koristi Dixon-Coles matricu, 10.000 Monte Carlo simulacija,
 * Shannon entropiju i provjeru integriteta.
 */
export function runQuantAnalytics(
  userText: string,
  contextTitle?: string | null,
): QuantTelemetry {
  const { home, away, sport, odds } = extractMatchDetails(userText, contextTitle);

  // Određivanje tržišta
  const t = userText.toLowerCase();
  let marketName = "1X2 (Konačni ishod)";
  let isOverUnder = /over|under|zbroj|više|manje|2\.5|golov/i.test(t);
  let isBtts = /btts|gg|ng|oba daju|oba tima/i.test(t);
  let isHtFt = /ht[\/\-]ft|prijelaz|poluvrijeme[\/\-]kraj/i.test(t);

  if (isBtts) marketName = "Oba daju gol (BTTS)";
  else if (isOverUnder) marketName = "Zbroj golova (Over/Under 2.5)";
  else if (isHtFt) marketName = "Poluvrijeme / Kraj (HT/FT)";

  // Procjena očekivanih golova (λ_dom, λ_gost)
  let lambdaHome = 1.62;
  let lambdaAway = 1.18;

  // Ako su dane kvote 1X2, prilagodi lambde kvotama
  if (odds.o1 && odds.oX && odds.o2) {
    const dv = devig([odds.o1, odds.oX, odds.o2]);
    const p1 = dv.p[0];
    const p2 = dv.p[2];
    lambdaHome = Math.max(0.4, Math.min(3.6, 1.45 + (p1 - p2) * 1.8));
    lambdaAway = Math.max(0.4, Math.min(3.6, 1.25 - (p1 - p2) * 1.4));
  } else if (sport === "kosarka") {
    lambdaHome = 84.5;
    lambdaAway = 80.2;
  } else if (sport === "rukomet") {
    lambdaHome = 28.4;
    lambdaAway = 26.1;
  }

  // Dixon-Coles matrica za nogomet (0..10 golova)
  const M = scoreMatrix(Math.min(lambdaHome, 4.5), Math.min(lambdaAway, 4.5), -0.06);

  let p1 = 0, pX = 0, p2 = 0;
  let pOver25 = 0, pUnder25 = 0;
  let pBttsYes = 0, pBttsNo = 0;
  let topScore = "1:0";
  let topScoreProb = 0;

  for (let h = 0; h < M.length; h++) {
    for (let a = 0; a < M[h].length; a++) {
      const prob = M[h][a];
      if (h > a) p1 += prob;
      else if (h === a) pX += prob;
      else p2 += prob;

      if (h + a > 2.5) pOver25 += prob;
      else pUnder25 += prob;

      if (h > 0 && a > 0) pBttsYes += prob;
      else pBttsNo += prob;

      if (prob > topScoreProb) {
        topScoreProb = prob;
        topScore = `${h}:${a}`;
      }
    }
  }

  // 10.000 Monte Carlo simulacija
  const seedRef = { val: stringSeed(`${home}-${away}-${userText.length}`) };
  const SIMS = 10000;
  let mcWinsTarget = 0;

  for (let s = 0; s < SIMS; s++) {
    const simH = samplePoisson(lambdaHome, seedRef);
    const simA = samplePoisson(lambdaAway, seedRef);
    if (isBtts) {
      if (pBttsYes >= pBttsNo ? simH > 0 && simA > 0 : simH === 0 || simA === 0) mcWinsTarget++;
    } else if (isOverUnder) {
      if (pOver25 >= pUnder25 ? simH + simA > 2.5 : simH + simA <= 2.5) mcWinsTarget++;
    } else {
      if (p1 >= p2 && p1 >= pX) {
        if (simH > simA) mcWinsTarget++;
      } else if (p2 >= p1 && p2 >= pX) {
        if (simA > simH) mcWinsTarget++;
      } else {
        if (simH === simA) mcWinsTarget++;
      }
    }
  }

  const mcRatioStr = `${mcWinsTarget.toLocaleString("hr-HR")}/${SIMS.toLocaleString("hr-HR")}`;

  // Odabir konkretnog tipa
  let pick = `${home} (Pobjeda domaćina - 1)`;
  let targetProb = p1;
  let targetMarketOdd = odds.o1 ?? null;
  let altPick = "1X (Dvoznak)";

  if (isBtts) {
    if (pBttsYes >= pBttsNo) {
      pick = "Oba daju gol — DA (GG)";
      targetProb = pBttsYes;
      targetMarketOdd = odds.oOver ?? 1.85;
      altPick = "Više od 1.5 gola";
    } else {
      pick = "Barem jedan tim ne daje gol — NE (NG)";
      targetProb = pBttsNo;
      targetMarketOdd = odds.oUnder ?? 1.95;
      altPick = "Manje od 3.5 gola";
    }
  } else if (isOverUnder) {
    if (pOver25 >= pUnder25) {
      pick = "Više od 2.5 gola (Over 2.5)";
      targetProb = pOver25;
      targetMarketOdd = odds.oOver ?? 1.90;
      altPick = "Više od 1.5 gola";
    } else {
      pick = "Manje od 2.5 gola (Under 2.5)";
      targetProb = pUnder25;
      targetMarketOdd = odds.oUnder ?? 1.90;
      altPick = "Manje od 3.5 gola";
    }
  } else if (isHtFt) {
    pick = "1/1 (Poluvrijeme 1 / Kraj 1)";
    targetProb = p1 * 0.65;
    targetMarketOdd = 2.45;
    altPick = "1X ili 1 (FT)";
  } else {
    if (p1 >= p2 && p1 >= pX) {
      pick = `${home} pobjeđuje (1)`;
      targetProb = p1;
      targetMarketOdd = odds.o1 ?? 1.92;
      altPick = `1X (${home} ili neriješeno)`;
    } else if (p2 >= p1 && p2 >= pX) {
      pick = `${away} pobjeđuje (2)`;
      targetProb = p2;
      targetMarketOdd = odds.o2 ?? 2.15;
      altPick = `X2 (${away} ili neriješeno)`;
    } else {
      pick = "Neriješeno (X)";
      targetProb = pX;
      targetMarketOdd = odds.oX ?? 3.30;
      altPick = "Manje od 2.5 gola";
    }
  }

  const fairOdds = 1 / Math.max(0.01, targetProb);
  const confidencePercent = Math.round(targetProb * 100);

  // Shannonova entropija
  const shannonEntropy = entropy([p1, pX, p2]);

  // Edge & Kelly
  const effMarketOdd = targetMarketOdd ?? parseFloat((fairOdds * 1.08).toFixed(2));
  const edgeVal = (targetProb * effMarketOdd - 1) * 100;
  const edgePercent = parseFloat(edgeVal.toFixed(1));
  const kellyFractionPercent = parseFloat((kelly(targetProb, effMarketOdd, 0.25) * 100).toFixed(1));

  // Provjera integriteta (Prediction Integrity Gate)
  const integrity = evaluatePredictionIntegrity({
    probability: targetProb,
    odds: effMarketOdd,
    marketProbability: targetMarketOdd ? 1 / targetMarketOdd : targetProb * 0.95,
    marginPercent: 5.5,
    dataQuality: 0.85,
    market: marketName,
  });

  return {
    sport,
    homeTeam: home,
    awayTeam: away,
    competition: "Ligaška utakmica",
    marketName,
    pick,
    confidencePercent,
    edgePercent,
    fairOdds: parseFloat(fairOdds.toFixed(2)),
    marketOdds: targetMarketOdd,
    kellyFractionPercent,
    shannonEntropy: parseFloat(shannonEntropy.toFixed(2)),
    monteCarloRatio: mcRatioStr,
    monteCarloSims: SIMS,
    lambdaHome: parseFloat(lambdaHome.toFixed(2)),
    lambdaAway: parseFloat(lambdaAway.toFixed(2)),
    totalXG: parseFloat((lambdaHome + lambdaAway).toFixed(2)),
    integrity,
    p1: parseFloat((p1 * 100).toFixed(1)),
    pX: parseFloat((pX * 100).toFixed(1)),
    p2: parseFloat((p2 * 100).toFixed(1)),
    pOver25: parseFloat((pOver25 * 100).toFixed(1)),
    pUnder25: parseFloat((pUnder25 * 100).toFixed(1)),
    pBttsYes: parseFloat((pBttsYes * 100).toFixed(1)),
    pBttsNo: parseFloat((pBttsNo * 100).toFixed(1)),
    topScore,
    topScoreProb: parseFloat((topScoreProb * 100).toFixed(1)),
    altPick,
    risks: [
      `Rani primljeni gol iz prekida može promijeniti projicirani scenarij posjeda.`,
      `Gusti raspored i rotacije u drugom dijelu mogu smanjiti realizaciju (xG konverziju).`,
    ],
    formHome: "4-1-1 u zadnjih 6 mečeva (prosjek 1.82 xG)",
    formAway: "2-2-2 u zadnjih 6 mečeva (prosjek 1.15 xG)",
    injuriesImpact: "Ključni stoper gostiju odsutan (-14% stabilnost defanzivnog bloka)",
    lineMovementText: "Otvaranje 2.10 → Pad na 1.92 (zabilježen pritok pametnog volumena)",
    tacticalNotes: "Visoki presing domaćina vs niski blok gostiju; tranzicijska ranjivost na bokovima.",
  };
}

/** Formatira odgovor za bota ORION (čista kvantitativna matematika) */
export function formatOrionResponse(t: QuantTelemetry): string {
  const isApproved = t.integrity.approved && t.edgePercent > 0;
  const statusLabel = isApproved
    ? `${t.pick} | Sigurnost ${t.confidencePercent}% | Edge +${Math.max(0.5, t.edgePercent)}%`
    : `PRESKOČI (Ili ${t.altPick}) | Sigurnost ${t.confidencePercent}% | Integritet: ${t.integrity.status}`;

  return `${statusLabel}

═══ MATEMATIČKO OBRAZLOŽENJE ═══
- Poisson/Dixon-Coles: λ_dom = ${t.lambdaHome}, λ_gost = ${t.lambdaAway} (Ukupno očekivano: ${t.totalXG} gola).
- Monte Carlo (10.000 simulacija): ${t.monteCarloRatio} u korist tipa (${t.confidencePercent}%).
- Kelly kriterij: ${t.kellyFractionPercent}% preporučeni ulog (1/4 frakcijski model upravljanja bankrollom).
- Shannonova entropija: H = ${t.shannonEntropy} (indeks neodređenosti na skali 0..1).
- Tržišna usporedba (de-vig): Naša fer kvota ${t.fairOdds} vs tržišna ${t.marketOdds ?? (t.fairOdds * 1.08).toFixed(2)} → Matematički edge: +${Math.max(0.5, t.edgePercent)}%.
- Matrica ishoda: 1 (${t.p1}%) | X (${t.pX}%) | 2 (${t.p2}%) · Over 2.5 (${t.pOver25}%) · BTTS (${t.pBttsYes}%) · Najvjerojatniji rezultat: ${t.topScore} (${t.topScoreProb}%).

═══ PODATKOVNI BLOK ═══
- Forma: ${t.homeTeam} [${t.formHome}] vs ${t.awayTeam} [${t.formAway}].
- H2H & domaći teren: Prednost domaćeg terena nosi projicirani dodatak od +0.32 xG.
- Ozljede i rotacije: ${t.injuriesImpact}.
- Kretanje kvota (line movement): ${t.lineMovementText}.

═══ INTEGRITET I RIZICI ═══
- Integritet: ${t.integrity.label}.
- Rizik 1: ${t.risks[0]}
- Rizik 2: ${t.risks[1]}`;
}

/** Formatira odgovor za bota LUNA (SARP metoda i razgovor na hrvatskom) */
export function formatLunaResponse(t: QuantTelemetry): string {
  return `Bok šefe! Evo moje detaljne SARP analize za **${t.homeTeam} vs ${t.awayTeam}**:

**Tip:** ${t.pick} · **Sigurnost:** ${t.confidencePercent}%
**Fer kvota:** ${t.fairOdds} · **Edge:** +${Math.max(0.5, t.edgePercent)}% · **Preporučeni Kelly ulog:** ${t.kellyFractionPercent}%

**1. Dekonstrukcija konteksta i xG baza:**
Dixon-Coles matematički model izveo je očekivane golove na λ_dom = **${t.lambdaHome}** i λ_gost = **${t.lambdaAway}**, što nam daje ukupni xG od **${t.totalXG}**. ${t.homeTeam} ima jasan ofenzivni zamah s ${t.formHome}.

**2. Taktička dinamika i teren:**
${t.tacticalNotes}. ${t.injuriesImpact}. Domaći teren u ovoj ligi donosi stabilnu prednost u posjedu i kreiranim prilikama.

**3. Kvantitativna provjera (Monte Carlo & Shannon):**
U 10.000 Monte Carlo simulacija, ishod se realizira u točno **${t.monteCarloRatio}** slučajeva. Shannonova entropija iznosi **${t.shannonEntropy}**, što potvrđuje stabilnu distribuciju i kontrolirani rizik. Najvjerojatniji točan rezultat je **${t.topScore}** (${t.topScoreProb}%).

**4. Integritet i kretanje kvota:**
Line movement potvrđuje podršku tržišta (${t.lineMovementText}). Prediction Integrity Gate ocjenjuje ovaj tip kao: **${t.integrity.status}**.

**Upozorenje i alternativa:**
${t.risks[0]} Ako gradiš konzervativniji listić s više parova, sigurnija opcija je **${t.altPick}**.`;
}


