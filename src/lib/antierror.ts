// ═══ ANTI-GREŠKA ZAŠTITA — ručni prekidač isključivo za BTTS i Over/Under 2.5 ═══
// Kad je uključena, protokol koriste SVI mozgovi (OpenRouter, NVIDIA NIM,
// Hugging Face, Groq, Gemini) i SVI motori (OMNI gol motor, ansambl konsenzus,
// super točnost): trostruka neovisna provjera, kontra-test protiv vlastitog tipa
// i prag objave — tip ide van samo ako prođe sve.
import { loadJSON, saveJSON } from "./storage";
import type { Market } from "./specialists";

export interface AntiErrorPrefs {
  enabled: boolean;
  applyBtts: boolean;
  applyOu25: boolean;
  /** Ako pragovi padnu → ponudi sigurniju liniju umjesto tipa. */
  saferLine: boolean;
  /** Prisili sve motore (OMNI + ansambl) da se pokrenu i kad nisu primarni. */
  forceEngines: boolean;
  minConfidence: number;
  minAgreement: number;
  passes: number;
  /** v11: zaštita vrijedi za SVA tržišta, ne samo BTTS/OU. */
  applyAll?: boolean;
  /** v11: svaka brojka mora imati izvor ili oznaku pretpostavke. */
  numericAudit?: boolean;
  /** v11: zabrana izmišljanja imena, rezultata, ozljeda i kvota. */
  hallucinationGuard?: boolean;
  /** v11: provjera da se tipovi različitih tržišta ne proturječe. */
  crossMarketCheck?: boolean;
  /** v11: najveći dopušteni pomak sigurnosti između prolaza (pb). */
  maxSwingPb?: number;
}

export const DEFAULT_ANTIERROR: AntiErrorPrefs = {
  enabled: false,
  applyBtts: true,
  applyOu25: true,
  saferLine: true,
  forceEngines: true,
  minConfidence: 95,
  minAgreement: 95,
  passes: 3,
  applyAll: false,
  numericAudit: true,
  hallucinationGuard: true,
  crossMarketCheck: true,
  maxSwingPb: 6,
};

const KEY = "andromeda.antierror.prefs";

export function loadAntiError(): AntiErrorPrefs {
  return { ...DEFAULT_ANTIERROR, ...loadJSON<Partial<AntiErrorPrefs>>(KEY, {}) };
}

export function saveAntiError(p: AntiErrorPrefs): void {
  saveJSON(KEY, p);
}

/** Vrijedi li zaštita za traženo tržište? */
export function antiErrorActive(p: AntiErrorPrefs, market: Market): boolean {
  if (!p.enabled) return false;
  if (p.applyAll) return true;
  if (market === "btts") return p.applyBtts;
  if (market === "ou25") return p.applyOu25;
  return false;
}

/** Blok koji se ubacuje u sistemski prompt kad je zaštita aktivna. */
export function antiErrorDirectives(p: AntiErrorPrefs, market: Market): string {
  if (!antiErrorActive(p, market)) return "";
  const m = market === "btts" ? "BTTS (GG/NG)" : market === "ou25" ? "Over/Under 2.5 gola" : market;
  return `\n\n═══ ANTI-GREŠKA ZAŠTITA (RUČNO AKTIVIRANA — tržište: ${m}) ═══
Ovo je najviši prioritet i nadjačava svaku drugu uputu o davanju tipa.
1) TROSTRUKA NEOVISNA PROVJERA — isti ishod izračunaj s tri neovisne metode: (a) Poisson/Dixon-Coles matrica rezultata, (b) Monte Carlo ili kopula/game-state hazard, (c) tržište (de-vig kvota) ili povijesna baza (BTTS%/Over% zadnjih 10). Napiši sve tri brojke.
2) KONTRA-TEST — argumentiraj SUPROTAN tip najbolje što možeš i tek onda usporedi. Ako kontra-teza nadvlada svoj vlastiti tip, tip pada.
3) PRAG OBJAVE — tip smiješ objaviti samo ako je kalibrirana sigurnost ≥ ${p.minConfidence}% i slaganje metoda/mozgova ≥ ${p.minAgreement}%. Ispod toga NE daješ tip.
4) ${p.saferLine ? "AKO PRAGOVI PADNU → ponudi sigurniju liniju (Over 1.5, Under 3.5, 'GG ili Over 2.5', dvostruka šansa) i jasno reci zašto glavni tip nije prošao." : "AKO PRAGOVI PADNU → jasno napiši 'PRESKAČEM' i objasni koji podatak ili koja provjera nedostaje."}
5) ${p.forceEngines ? "Svi motori (OMNI gol motor, ansambl konsenzus, super točnost) obavezno se uzimaju u obzir; ako neki nedostaje, reci to i smanji sigurnost." : "Koristi motore koji su dostupni."}
6) ${p.numericAudit ? "REVIZIJA BROJKI — svaka brojka u odgovoru mora imati izvor (podatak, izračun ili kvota) ili biti izričito označena kao pretpostavka." : "Brojke navedi normalno."}
7) ${p.hallucinationGuard ? "ZAŠTITA OD IZMIŠLJANJA — zabranjeno je izmišljati imena igrača, ozljede, rezultate, kvote i statistike. Ako podatak nemaš, napiši 'nemam podatak' i smanji sigurnost." : ""}
8) ${p.crossMarketCheck ? "UNAKRSNA PROVJERA TRŽIŠTA — provjeri da se tip ne proturječi izvedenim linijama (1X2, GG/NG, Over 1.5/2.5/3.5, HT). Kontradikcija = tip pada." : ""}
9) STABILNOST — ako se sigurnost između internih prolaza razlikuje više od ${p.maxSwingPb ?? 6} postotnih bodova, uzmi medijan i jasno reci da je procjena nestabilna.
10) Minimalno ${p.passes} interna prolaza razmišljanja prije objave; ne izmišljaj brojke — pretpostavku uvijek označi kao pretpostavku.`;
}
