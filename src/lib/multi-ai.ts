// VIJEĆE AI-JA (GG Multi-Model stil) — Luna postavi isto pitanje paralelno
// nekoliko besplatnih modela s različitih servera (OpenRouter :free), pa
// "sudija" model spoji njihove odgovore u jedan konačni, najbolji odgovor.
// Sve besplatno: samo :free modeli i tvoj OpenRouter ključ.
import { openrouterChat, specialistDefault, type ORMessage } from "./openrouter";
import { hasKey } from "./storage";

export interface CouncilTurn {
  role: "user" | "assistant";
  content: string;
}

/** Modeli u vijeću — svi besplatni, s različitih servera. */
export const COUNCIL_MODELS: { id: string; label: string }[] = [
  { id: "deepseek/deepseek-chat-v3.1:free", label: "DeepSeek v3.1" },
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B" },
  { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B" },
  { id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick" },
  { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B" },
];

export interface CouncilOpinion {
  label: string;
  answer: string;
}

/** Lokalni timeout da chat nikad ne visi na sporom modelu. */
function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${ms / 1000} s`)), ms),
    ),
  ]);
}

/**
 * Pokreni vijeće. Vraća konačni odgovor stringom, ili null ako vijeće
 * nije uspjelo (pa normalan mozak preuzme stvar).
 */
export async function runCouncil(
  sys: string,
  history: CouncilTurn[],
  userText: string,
  opts: { memberCount?: number } = {},
): Promise<string | null> {
  if (!hasKey("openrouter")) return null;
  const n = Math.max(2, Math.min(COUNCIL_MODELS.length, opts.memberCount ?? 4));
  const members = COUNCIL_MODELS.slice(0, n);

  const results = await Promise.allSettled(
    members.map(async (m): Promise<CouncilOpinion> => {
      const msgs: ORMessage[] = [{ role: "system", content: sys }];
      for (const t of history) msgs.push({ role: t.role, content: t.content });
      msgs.push({ role: "user", content: userText || "(bez teksta)" });
      const answer = await timeout(openrouterChat(m.id, msgs, { maxTokens: 1600 }), 60_000);
      return { label: m.label, answer };
    }),
  );

  const opinions = results.flatMap((r) =>
    r.status === "fulfilled" && r.value.answer ? [r.value] : [],
  );
  if (opinions.length === 0) return null;

  // Samo jedan član odgovorio → nema čega spajati, vrati njegov odgovor.
  if (opinions.length === 1) return opinions[0].answer;

  const transcript = opinions
    .map((o, i) => `— ODGOVOR ${i + 1} · ${o.label} —\n${o.answer}`)
    .join("\n\n");

  const synthSys = `${sys}

═══ ULOGA: SUDIJA VIJEĆA ═══
Isto pitanje dobilo je ${opinions.length} neovisnih AI savjetnika s različitih servera. Pročitaj njihove odgovore i napiši JEDAN konačni odgovor:
- Gdje se slažu, to je najvjerojatnija istina — naglasi to s povjerenjem.
- Gdje se razilaze, odluči se i u jednoj rečenici objasni zašto (spomeni raspon mišljenja).
- Pišeš kao LUNA u prvom licu ženskog roda, isključivo hrvatski, istim stilom kao inače. Ne spominji "odgovor 1/2/3" kao tuđe rečenice.
- Na samom kraju dodaj kratak red: "Konzultirala sam: ${opinions.map((o) => o.label).join(", ")}."`;

  const judge = await timeout(
    openrouterChat(
      specialistDefault(),
      [
        { role: "system", content: synthSys },
        {
          role: "user",
          content: `PITANJE KORISNIKA:\n${userText || "(bez teksta)"}\n\nODGOVORI VIJEĆA:\n${transcript}\n\nNapiši konačni odgovor kao Luna.`,
        },
      ],
      { maxTokens: 2400 },
    ),
    90_000,
  );
  return judge || opinions[0].answer;
}
