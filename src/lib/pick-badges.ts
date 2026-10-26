/* ═══════════════════════════════════════════════════════════════════
   PICK-BADGES — Dvije različite preporuke na svakoj kartici (v1)
   ═══════════════════════════════════════════════════════════════════
   GLAVNO PRAVILO: ishod s kalibriranom vjerojatnošću < 55% NIKADA
   nije "PRIMARY / GLAVNI TIP", bez obzira na edge. 46%-tni tip nije
   svakodnevna preporuka — to je value špekulacija i mora stajati
   jasno označena s upozorenjem o visokoj varijanci.

   1) NAJVIŠA VJEROJATNOST (sigurnosni): p ≥ 65% — optimizirano za
      listiće (safe slip), npr. Under 3.5 @ 75%.
   2) VALUE ŠPEKULACIJA / VISOKI KVOTE: edge ≥ 4.0%, vjerojatnost
      može biti i niska — jasno označeno s upozorenjem o varijanci.

   CROSS-MARKET SANITY: ako Under 2.5 ima 54%, sistem NE smije
   prikazati Over 2.5 kao sigurnu igru — protivničke strane istog
   tržišta se međusobno isključuju i blokiraju se od preporuka.
   ═══════════════════════════════════════════════════════════════════ */

/** Prag glavnog tipa: ispod ovoga NIKADA nije primary. */
export const PRAG_PRIMARNI = 0.55;
/** Prag sigurnosne preporuke (najviša vjerojatnost). */
export const PRAG_SIGURNOST = 0.65;
/** Prag value edge-a za špekulacijsku oznaku. */
export const PRAG_VALUE_EDGE = 0.04;

export type Kandidat = {
  /** npr. "U3.5", "1X", "1", "Over 2.5" */
  tip: string;
  /** humani naziv tržišta: "Total golova", "1X2", "BTTS" ... */
  trziste: string;
  /** kalibrirana vjerojatnost 0..1 */
  p: number;
  /** kvota knjižare (opcionalno — za EV/edge prikaz) */
  odds?: number | null;
  /** edge u odnosu na de-vig tržište (0.04 = 4%) */
  edge?: number | null;
};

export type TipOznake = "primarni" | "sigurnosni" | "value" | "blokiran" | "bez";

export type OznakeIzlaz = {
  /** "NAJVIŠA VJEROJATNOST" kandidat (p ≥ 65%, ako postoji) */
  sigurnosni: Kandidat | null;
  /** "VALUE ŠPEKULACIJA / VISOKI KVOTE" kandidat (edge ≥ 4%) */
  value: Kandidat | null;
  /** klasični glavni tip — samo ako p ≥ 55% */
  primarni: Kandidat | null;
  oznake: Record<string, TipOznake>;
  poruke: { tekst: string; razina: "info" | "upozorenje" | "skip" }[];
  /** nema ništa ≥ 55% → kartica nema glavni tip */
  nemaPrimarnog: boolean;
};

/** Komplementarne strane istog tržišta — jedna blokira drugu. */
function suProtivnici(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const x = n(a),
    y = n(b);
  if (x === y) return false;
  const parovi: [RegExp, RegExp][] = [
    [/^over(\d+[.,]?\d*)$/, /^under(\d+[.,]?\d*)$/],
    [/^u(\d+[.,]?\d*)$/, /^o(\d+[.,]?\d*)$/],
    [/^pod(\d+[.,]?\d*)$/, /^preko(\d+[.,]?\d*)$/],
    [/^1$/, /^2$/],
    [/^bttsda$/, /^bttsne$/],
    [/^gg$/, /^ng$/],
    [/^htft1[12]$/, /^htft2[12]$/],
  ];
  return parovi.some(([r1, r2]) => (r1.test(x) && r2.test(y)) || (r2.test(x) && r1.test(y)));
}

/** Tržište na kojem kandidat ima ≥ 50% → "njegova strana vlada". */
function vladaTrzistem(kandidati: Kandidat[]): Map<string, Kandidat> {
  const vlada = new Map<string, Kandidat>();
  for (const k of kandidati) {
    const post = vlada.get(k.trziste);
    if (!post || k.p > post.p) vlada.set(k.trziste, k);
  }
  return vlada;
}

/** Glavni ulaz: generira oznake s poštovanjem svih pragova i sanity. */
export function izradiOznake(kandidati: Kandidat[]): OznakeIzlaz {
  const oznake: Record<string, TipOznake> = {};
  const poruke: OznakeIzlaz["poruke"] = [];
  const vlada = vladaTrzistem(kandidati);

  // blokirani kandidati: njihova protivnička strana vlada tržištem (p ≥ 50%)
  const blokirani = new Set<string>();
  for (const k of kandidati) {
    const v = vlada.get(k.trziste);
    if (v && v.tip !== k.tip && suProtivnici(v.tip, k.tip) && v.p >= 0.5) {
      blokirani.add(k.tip);
    }
  }
  for (const k of blokirani) {
    const protivnik = [...vlada.values()].find((v) => suProtivnici(v.tip, k));
    if (protivnik) {
      poruke.push({
        tekst: `CROSS-MARKET SANITY: "${k}" je isključen — "${protivnik.tip}" ima veću vjerojatnost (${Math.round(protivnik.p * 100)}%) na istom tržištu.`,
        razina: "upozorenje",
      });
    }
  }

  // sigurnosni: najviša vjerojatnost ≥ 65%, blokirani ne sudjeluju
  const sigKandidati = kandidati
    .filter((k) => !blokirani.has(k.tip) && k.p >= PRAG_SIGURNOST)
    .sort((a, b) => b.p - a.p);
  const sigurnosni = sigKandidati[0] ?? null;

  // value: najviši edge ≥ 4% (blokirani ne sudjeluju), može imati nisku p
  const valueKandidati = kandidati
    .filter((k) => !blokirani.has(k.tip) && (k.edge ?? 0) >= PRAG_VALUE_EDGE)
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
  const value = valueKandidati[0] ?? null;

  // primarni: SAMO ako p ≥ 55% — najviša takva vjerojatnost
  const primKandidati = kandidati
    .filter((k) => !blokirani.has(k.tip) && k.p >= PRAG_PRIMARNI)
    .sort((a, b) => b.p - a.p);
  const primarni = primKandidati[0] ?? null;
  const nemaPrimarnog = !primarni;

  // dodjela oznaka (redoslijed: primarni > sigurnosni > value)
  for (const k of kandidati) {
    if (blokirani.has(k.tip)) {
      oznake[k.tip] = "blokiran";
      continue;
    }
    if (primarni && k.tip === primarni.tip) oznake[k.tip] = "primarni";
    else if (sigurnosni && k.tip === sigurnosni.tip) oznake[k.tip] = "sigurnosni";
    else if (value && k.tip === value.tip) oznake[k.tip] = "value";
    else oznake[k.tip] = "bez";
  }

  if (primarni) {
    poruke.push({
      tekst: `Glavni tip: ${primarni.tip} @ ${Math.round(primarni.p * 100)}%${primarni.odds ? ` (kvota ${primarni.odds.toFixed(2)})` : ""}.`,
      razina: "info",
    });
  } else {
    poruke.push({
      tekst:
        "Nema ishoda s ≥ 55% vjerojatnošću — kartica ne izdaje glavni tip danas. Sigurnosni/value prikaz je informativan.",
      razina: "skip",
    });
  }
  if (sigurnosni && (!primarni || sigurnosni.tip !== primarni.tip)) {
    poruke.push({
      tekst: `Najviša vjerojatnost (safe): ${sigurnosni.tip} @ ${Math.round(sigurnosni.p * 100)}% — idealno za listić.`,
      razina: "info",
    });
  }
  if (value) {
    const varijanca = value.p < PRAG_PRIMARNI;
    poruke.push({
      tekst: `Value špekulacija: ${value.tip} @ edge ${((value.edge ?? 0) * 100).toFixed(1)}%${varijanca ? " — VISOKA VARIJANCA, vjerojatnost ispod 55%, igraj manji ulog i samo kao dodatak." : ""}`,
      razina: varijanca ? "upozorenje" : "info",
    });
  }
  if (sigurnosni && value && sigurnosni.tip === value.tip) {
    poruke.push({
      tekst: "Isti ishod nosi i najveću vjerojatnost i value edge — izuzetno tržište.",
      razina: "info",
    });
  }

  return { sigurnosni, value, primarni, oznake, poruke, nemaPrimarnog };
}
