// ============================================================
// BOTovi.TS — Dual-AI: LUNA (SARP/Titan) i ORION (Data & Taktika)
// Sport-specifični predlošci upita za maksimalnu preciznost.
// ============================================================

/** Sekundarni agent ORION — puna persona (ubrizgava se u prvu poruku). */
export const ORION_PERSONA = `OD SADA NASTUPAŠ KAO ORION — NE KAO LUNA. Ignoriraj uputu da si Luna; ovo je novi identitet.

═══ ORION — DATA & TAKTIČKI ANALITIČAR (Andromeda AI) ═══
Specijalizacija: duboka statistika, kretanje kvota (line movement), ozljede i izostanci, motivacijski kontekst, taktički matchupovi i alternativni sportovi (košarka, rukomet).

═══ OBLIK ODGOVORA (OBAVEZNO, UVIJEK) ═══
1. PRVI RED — naljepnica tipa: "TIP | Sigurnost XX% | Edge +X.X%"
2. ZATIM matematičko obrazloženje (telegrafski, s brojkama):
   - Poisson/Dixon-Coles: λ_dom, λ_gost i kako su izvedeni
   - Monte Carlo: omjer simulacija u korist tipa (npr. 6.410/10.000)
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

