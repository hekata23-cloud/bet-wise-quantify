// ═══ REZERVNI MOZAK za AI Prognozu — BESPLATNO ═══
// Kad Lovable AI Gateway kaže da su krediti potrošeni (402) ili je zauzet (429),
// ova kartica ne ostaje prazna: ista prognoza se izračuna preko korisnikovog
// besplatnog OpenRouter ključa (:free modeli). Nula Lovable kredita.
// Model dobiva iste de-vig + Dixon-Coles brojke i ista pravila kao glavni mozak.
import { openrouterChat } from "./openrouter";
import { hasKey } from "./storage";
import type { AiPrognoza } from "./ai-prognoza.functions";

export type FallbackResult = { ok: true; p: AiPrognoza } | { ok: false; error: string };

/** Besplatni OpenRouter modeli u redoslijedu pokušaja. */
const FREE_MODELS = [
  // Free Router uvijek routa na trenutno živi besplatni model — najsigurniji prvi.
  "openrouter/free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "thinkingmachines/inkling:free",
  "google/gemma-4-31b-it:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
];

const SCHEMA_TEXT = `{
  "glavniTip": string, "trziste": string, "vjerojatnost": number (0-100),
  "ferKvota": number (=100/vjerojatnost), "kvota": number|null, "evPostotak": number|null,
  "isplativo": boolean, "sigurnosnaLinija": string, "tocanRezultat": string,
  "ulogPostotak": number, "obrazlozenje": string, "rizici": string[]
}`;

const RULES = `Ti si profesionalni kvotni analitičar (sharp bettor). Odgovaraš na hrvatskom.
PRAVILA:
- Koristi ISKLJUČIVO dane vjerojatnosti modela (de-vig + Dixon-Coles). Ne izmišljaj brojeve, ne mijenjaj ih više od ±3 postotna boda.
- vjerojatnost je postotak 0-100. ferKvota = 100/vjerojatnost.
- Ako korisnik traži vrstu oklade, glavniTip MORA biti iz te vrste.
- evPostotak = (vjerojatnost/100 × kvota − 1) × 100 ako je kvota poznata, inače null. isplativo = evPostotak > 2.
- Tip ne smije proturječiti točnom rezultatu ni sigurnosnoj liniji (npr. "Manje 2.5" + rezultat 2:1 je zabranjeno).
- Ako je vjerojatnost < 60%, sigurnosnaLinija je sigurnija varijanta (dvostruka šansa, niža linija golova); inače "Nije potrebna".
- ulogPostotak: 1/4 Kelly u % banke, 0 ako nije isplativo, maksimalno 3.
- obrazlozenje: 2-4 rečenice konkretno. rizici: 1-3 kratke stavke.`;

function parsePrognoza(out: string): AiPrognoza | null {
  const s = out.indexOf("{");
  const e = out.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  let x: any;
  try {
    x = JSON.parse(out.slice(s, e + 1));
  } catch {
    return null;
  }
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const vjerojatnost = num(x.vjerojatnost);
  const ferKvota = num(x.ferKvota);
  const ulogPostotak = num(x.ulogPostotak) ?? 0;
  if (!x || typeof x.glavniTip !== "string" || vjerojatnost === null || ferKvota === null) return null;
  if (typeof x.obrazlozenje !== "string" || !Array.isArray(x.rizici)) return null;
  return {
    glavniTip: String(x.glavniTip),
    trziste: typeof x.trziste === "string" ? x.trziste : "—",
    vjerojatnost,
    ferKvota,
    kvota: num(x.kvota),
    evPostotak: num(x.evPostotak),
    isplativo: Boolean(x.isplativo),
    sigurnosnaLinija: typeof x.sigurnosnaLinija === "string" ? x.sigurnosnaLinija : "—",
    tocanRezultat: typeof x.tocanRezultat === "string" ? x.tocanRezultat : "—",
    ulogPostotak,
    obrazlozenje: x.obrazlozenje,
    rizici: (x.rizici as unknown[]).filter((r): r is string => typeof r === "string").slice(0, 3),
  };
}

/**
 * Pokreni rezervni mozak. Vraća prognozu ili opis greške (npr. da OpenRouter
 * ključ nije spremljen u Postavkama). Nikad ne troši Lovable kredite.
 */
/** Lokalni timeout da rezervni mozak nikad ne visi na sporom modelu. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`nema odgovora ${ms / 1000} s`)), ms),
    ),
  ]);
}

export async function runAiPrognozaFallback(input: {
  utakmica: string;
  vrstaOklade: string;
  kontekst: string;
}, onProgress?: (m: string) => void): Promise<FallbackResult> {
  if (!hasKey("openrouter")) {
    return { ok: false, error: "Za besplatni rezervni mozak dodaj OpenRouter ključ u Postavkama." };
  }
  const sys = `${RULES}

FORMAT ODGOVORA: vrati ISKLJUČIVO jedan JSON objekt, bez markdowna, bez obrazloženja van JSON-a, po ovoj shemi:
${SCHEMA_TEXT}`;
  const user = `Utakmica: ${input.utakmica}\nTražena vrsta oklade: ${input.vrstaOklade || "bilo koja (najbolji tip)"}\n\nPodaci modela:\n${input.kontekst}`;
  const errs: string[] = [];
  for (const model of FREE_MODELS) {
    try {
      onProgress?.(`Rezervni mozak (besplatno): ${model}…`);
      const out = await withTimeout(openrouterChat(model, [
        { role: "system", content: sys },
        { role: "user", content: user },
      ], { maxTokens: 1400, temperature: 0.3 }), 50_000);
      const p = parsePrognoza(out);
      if (p) return { ok: true, p };
      errs.push(`${model}: nevažeći JSON`);
    } catch (e) {
      errs.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, error: `Rezervni mozak nije uspio. ${errs.slice(0, 3).join(" | ")}` };
}
