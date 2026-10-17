// ═══ REZERVNI MOZAK za AI Prognozu — BESPLATNO ═══
// Kad Lovable AI Gateway kaže da su krediti potrošeni (402) ili je zauzet (429)
// ili visi, ova kartica ne ostaje prazna: ista prognoza se izračuna preko
// korisnikovog besplatnog OpenRouter ključa (:free modeli). Nula Lovable kredita.
//
// v4 — ŠTEDLJIVO, JEDAN MODEL PO JEDAN:
// OpenRouter besplatno = 50 zahtjeva/dan i 20 u minuti, PO RAČUNU (ne po modelu).
// Staro paralelno granje (4+ modela po kliku) ubijalo je dnevni limit za
// nekoliko klikova i izazivalo 429. Sada:
//  - klik = u pravilu 1 zahtjev (prvi model koji uspije pobjeđuje);
//  - na 429 odmah stajemo s jasnom porukom (limit je računski, ne modelski);
//  - najviše 4 pokušaja i najviše 3 minute po kliku — nikad "vrti mozgove".
// Popis modela provjeren živim upitom na OpenRouter /models (17.10.2026).
import { openrouterChat, jeRateGreska, orUsageToday, FREE_DAILY_LIMIT } from "./openrouter";
import { hasKey } from "./storage";
import type { AiPrognoza } from "./ai-prognoza.functions";

export type FallbackResult = { ok: true; p: AiPrognoza } | { ok: false; error: string };

const FREE_MODELS = [
  "google/gemma-4-31b-it:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "xingchen-agi/xing4.0-29b-a4b:free",
  "nvidia/nemotron-3.5-super-vl:free",
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

/** Izvući JSON kandidat iz odgovora modela (podnosi markdown i tekst oko njega). */
function extractJson(out: string): string | null {
  const s = out.replace(/```[a-z]*\s*/gi, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  return s.slice(first, last + 1);
}

function parsePrognoza(out: string): AiPrognoza | null {
  const raw = extractJson(out);
  if (!raw) return null;
  let x: any = null;
  try {
    x = JSON.parse(raw);
  } catch {
    // Popravi najčešće greške modela: zapete zarede prije } ili ].
    try {
      x = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
  if (!x) return null;
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const vjerojatnost = num(x.vjerojatnost);
  const ferKvota = num(x.ferKvota) ?? (vjerojatnost !== null && vjerojatnost > 0 ? 100 / vjerojatnost : null);
  const ulogPostotak = num(x.ulogPostotak) ?? 0;
  if (typeof x.glavniTip !== "string" || vjerojatnost === null || ferKvota === null) return null;
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

/** Lokalni timeout da rezervni mozak nikad ne visi na sporom modelu. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`nema odgovora ${ms / 1000} s`)), ms),
    ),
  ]);
}

const MODEL_TIMEOUT_MS = 55_000;
const MAX_POKUSAJA = 4;          // najviše 4 modela po kliku
const UKUPNI_ROK_MS = 3 * 60_000; // apsolutni plafon: 3 minute po kliku

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
  const poruke = [
    { role: "system" as const, content: sys },
    { role: "user" as const, content: user },
  ];

  /** Jedan pokušaj modela: vraća parsiranu prognozu ili baca grešku. */
  const pokusaj = async (model: string): Promise<AiPrognoza> => {
    const out = await withTimeout(
      openrouterChat(model, poruke, { maxTokens: 1400, temperature: 0.3 }),
      MODEL_TIMEOUT_MS,
    );
    const p = parsePrognoza(out);
    if (p) return p;
    throw new Error(`${model}: nevažeći JSON`);
  };

  // Dnevni limit je računski: ako je lokalna procjena došla do 50, ne troši
  // ni jedan dodatni zahtjev na pokušaje.
  const potroseno = orUsageToday();
  if (potroseno >= FREE_DAILY_LIMIT) {
    return {
      ok: false,
      error: `Dnevni besplatni limit OpenRotera (${FREE_DAILY_LIMIT} zahtjeva) je vjerojatno potrošen. Obnavlja se u 02:00 po noći (ponoć UTC). Trajno rješenje: 10 $ kredita na OpenRouteru → 1000 zahtjeva dnevno.`,
    };
  }

  const errs: string[] = [];
  const rok = Date.now() + UKUPNI_ROK_MS;
  let pokusano = 0;

  for (const model of FREE_MODELS) {
    if (pokusano >= MAX_POKUSAJA) break;
    if (Date.now() > rok) { errs.push("isteklo ukupno vrijeme (3 min)"); break; }
    pokusano++;
    onProgress?.(
      `Rezervni mozak (${pokusano}/${MAX_POKUSAJA}): ${model} — danas oko ${potroseno + pokusano}/${FREE_DAILY_LIMIT} zahtjeva…`,
    );
    try {
      const p = await pokusaj(model);
      return { ok: true, p };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 429 → stajemo ODMAH. Limit je po računu, pa zamjena modela ne pomaže.
      if (jeRateGreska(msg)) {
        return {
          ok: false,
          error: `OpenRouter ograničenje (429): besplatno je 50 zahtjeva/dan i 20 u minuti — po računu, ne po modelu. Pričekaj minutu; dnevni limit se resetira u 02:00. Trajno rješenje: 10 $ kredita → 1000 zahtjeva/dan.`,
        };
      }
      errs.push(msg);
    }
  }

  // Sažetak grešaka: bez duplikata, prva 4, da se vidi TOČNO zašto je stalo.
  const jedinstvene = [...new Set(errs)].slice(0, 4).join(" | ");
  return { ok: false, error: `Rezervni mozak nije uspio (${pokusano} ${pokusano === 1 ? "pokušaj" : "pokušaja"} po kliku — štedimo dnevni limit). ${jedinstvene}` };
}
