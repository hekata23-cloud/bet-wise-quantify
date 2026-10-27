// ANSAMBL KONSENZUS v5 ("Super točnost") — više besplatnih modela paralelno daje
// numeričku procjenu (λ, P) u strogom JSON-u, uz self-consistency (više prolaza).
// Procjene se spajaju robusnom statistikom (MAD + težinski trimmed mean),
// kalibriraju vlastitom Dixon-Coles/bivariate matricom, spajaju s de-vig
// kvotom u logit prostoru i provjeravaju Monte Carlom.
import { openrouterChat, type ORMessage } from "./openrouter";
import { nvidiaChat, NIM_GOAL_MODELS, NIM_MODELS } from "./nvidia";
import { groqChat, type GroqMessage } from "./groq";
import { geminiChat } from "./gemini";
import { hasKey } from "./storage";
import { ensembleForMarket, MARKET_LABEL, type Market } from "./specialists";
import {
  loadAccuracy, scoreMatrix, marketProbs, probForMarket, robustMean, median,
  blendWithMarket, shrinkToPrior, devig, parseOdds, verdict,
  saferAlternative, leaguePriorTotal, type MarketProbs, type Verdict, type AccuracyPrefs,
} from "./accuracy";
import {
  loadSuper, runSuperPipeline, superPromptDirectives, superBriefing, plattCalibrate,
  confWeightedMean, coherenceCheck, applyPenalty, parseEloDiff,
  type SuperPrefs, type CoherenceReport, type SuperPipelineOutput,
} from "./superaccuracy";

export interface MemberEstimate {
  model: string;
  name: string;
  lambdaHome: number;
  lambdaAway: number;
  pMain: number;
  pick: string;
  note: string;
  conf: number;
}

export interface ConsensusResult {
  market: Market;
  members: MemberEstimate[];
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;
  pModel: number;
  pMarket: number | null;
  pMain: number;
  pAlt: number;
  probs: MarketProbs;
  mc: { over25: number; btts: number; home: number; draw: number };
  verdict: Verdict;
  safer: string;
  agreement: number;
  spread: number;
  summary: string;
  prefs: AccuracyPrefs;
  super: SuperPrefs;
  pipeline: SuperPipelineOutput;
  coherence: CoherenceReport | null;
}

export const MAIN_LABEL: Record<Market, string> = {
  btts: "GG (oba tima zabijaju)",
  ou25: "Over 2.5 gola",
  htgoals: "HT Over 0.5 gola",
  "1x2": "pobjeda domaćina (1)",
  htft: "1/1 (domaćin vodi na poluvremenu i pobjeđuje)",
  htx: "X na poluvremenu",
  opce: "glavni ishod",
};

export const ALT_LABEL: Record<Market, string> = {
  btts: "NG (netko ne zabije)",
  ou25: "Under 2.5 gola",
  htgoals: "HT Under 0.5 (0:0 do odmora)",
  "1x2": "ne-pobjeda domaćina (X2)",
  htft: "ostale HT/FT kombinacije",
  htx: "nije X na poluvremenu",
  opce: "suprotan ishod",
};

function memberPrompt(
  market: Market,
  userText: string,
  ctx: string,
  pass: number,
  priorTotal: number,
  sp: SuperPrefs,
): ORMessage[] {
  const sys = `Ti si kvantitativni analitičar nogometa (prolaz ${pass}). Radi TIHO i vrati ISKLJUČIVO JSON, bez teksta prije/poslije, bez markdown blokova.
Postupak (obavezno, korak po korak u glavi):
1) λ_dom = (napad_dom xG/90 ÷ prosjek lige) × (xGA_gost ÷ prosjek lige) × prosjek lige × 1.12; λ_gost isto ×0.92.
2) Prosjek golova lige ako nije poznat: ${priorTotal.toFixed(2)} ukupno.
3) Korekcije λ: ključni napadač van −0.22; stožer obrane van +0.18 protivniku; ≤3 dana odmora −0.08; derbi −0.10; utakmica bez uloga +0.12; teški teren/vjetar −0.10; visoki pressing protiv slabe gradnje +0.15.
4) Poissonova matrica 0..8 uz Dixon-Coles τ i korelaciju ρ ≈ −0.03; iz nje izvedi tržište: ${MARKET_LABEL[market]} — glavni ishod "${MAIN_LABEL[market]}".
5) Kalibracija: ako tvoja P odstupa > 8 postotnih bodova od de-vig kvote, prepolovi odstupanje.
6) conf = koliko si siguran u vlastite ulazne podatke (0..1). Budi iskren; ako nemaš stvarne brojke, conf ≤ 0.5.
Vrati točno ovaj JSON i ništa drugo:
{"lambda_home":number,"lambda_away":number,"p_main":number (0..1 za "${MAIN_LABEL[market]}"),"conf":number (0..1),"pick":"kratki tip","note":"jedna rečenica ključnog razloga na hrvatskom"}${superPromptDirectives(sp, market)}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: `${userText}\n\n${ctx}`.trim() },
  ];
}

function parseMember(raw: string): Omit<MemberEstimate, "model" | "name"> | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
    const lh = num(j.lambda_home);
    const la = num(j.lambda_away);
    let p = num(j.p_main);
    if (p > 1 && p <= 100) p = p / 100;
    if (!Number.isFinite(p) || p < 0 || p > 1) return null;
    let conf = num(j.conf);
    if (conf > 1 && conf <= 100) conf = conf / 100;
    return {
      lambdaHome: Number.isFinite(lh) ? Math.min(Math.max(lh, 0.1), 5) : 1.3,
      lambdaAway: Number.isFinite(la) ? Math.min(Math.max(la, 0.1), 5) : 1.1,
      pMain: p,
      conf: Number.isFinite(conf) ? Math.min(Math.max(conf, 0.1), 1) : 0.6,
      pick: typeof j.pick === "string" ? j.pick : "",
      note: typeof j.note === "string" ? j.note : "",
    };
  } catch {
    return null;
  }
}

interface TeamMember {
  id: string;
  name: string;
  provider: "openrouter" | "nvidia" | "groq" | "gemini";
}

/** Sastavlja ansambl od svih mozgova za koje postoji ključ (ne samo OpenRoutera). */
function buildTeam(market: Market, size: number): TeamMember[] {
  const out: TeamMember[] = [];
  if (hasKey("openrouter")) {
    for (const s of ensembleForMarket(market, Math.max(3, size))) {
      out.push({ id: s.id, name: s.name, provider: "openrouter" });
    }
  }
  if (hasKey("nvidia")) {
    const ids = [...NIM_GOAL_MODELS, ...NIM_MODELS.map((m) => m.id)].filter(
      (v, i, self) => self.indexOf(v) === i,
    );
    for (const id of ids.slice(0, size)) out.push({ id, name: `NIM ${id.split("/").pop()}`, provider: "nvidia" });
  }
  if (hasKey("groq")) out.push({ id: "groq", name: "Groq Llama 3.3 70B", provider: "groq" });
  if (hasKey("gemini")) out.push({ id: "gemini", name: "Gemini Flash", provider: "gemini" });
  return out.slice(0, Math.max(1, size));
}

async function memberChat(
  m: TeamMember,
  msgs: ORMessage[],
  o: { temperature: number; maxTokens: number },
): Promise<string> {
  const sys = String(msgs[0].content ?? "");
  const user = String(msgs[1]?.content ?? "");
  if (m.provider === "openrouter") return openrouterChat(m.id, msgs, { ...o, extraFallbacks: [] });
  if (m.provider === "nvidia")
    return nvidiaChat(m.id, [
      { role: "system", content: sys },
      { role: "user", content: user },
    ], { ...o, extraFallbacks: [] });
  if (m.provider === "groq")
    return groqChat([
      { role: "system", content: sys },
      { role: "user", content: user },
    ] as GroqMessage[]);
  return geminiChat(sys, [{ role: "user", parts: [{ text: user }] }]);
}

/** Pokreće ansambl i vraća spojenu procjenu. Baca grešku ako nitko ne odgovori. */
export async function runConsensus(
  market: Market,
  userText: string,
  ctx: string,
  opts: { turbo?: boolean } = {},
): Promise<ConsensusResult> {
  const a = loadAccuracy();
  const sp = loadSuper();
  // Turbo: ansambl ograničen na 3 člana, 1 prolaz, niži maxTokens.
  const teamSize = opts.turbo ? 3 : Math.max(3, Math.min(a.members, 9));
  const team = buildTeam(market, teamSize);
  if (!team.length)
    throw new Error("Ansambl nema nijedan dostupan mozak — unesi barem jedan API ključ u Postavkama.");
  const priorTotal = a.leaguePrior ? leaguePriorTotal(`${userText} ${ctx}`) : 2.68;
  const passes = opts.turbo ? 1 : Math.max(1, Math.min(a.passes, 3));

  const settled = await Promise.allSettled(
    team.map(async (s) => {
      const runs: Omit<MemberEstimate, "model" | "name">[] = [];
      for (let p = 1; p <= passes; p++) {
        try {
          const raw = await memberChat(s, memberPrompt(market, userText, ctx, p, priorTotal, sp), {
            temperature: p === 1 ? 0.15 : 0.45,
            maxTokens: opts.turbo ? 420 : 700,
          });
          const parsed = parseMember(raw);
          if (parsed) runs.push(parsed);
        } catch (e) {
          console.warn(`Ansambl član ${s.name} nije uspio:`, e);
        }
      }
      if (!runs.length) throw new Error(`${s.name}: nema valjanog JSON-a`);
      return {
        model: s.id,
        name: s.name,
        lambdaHome: median(runs.map((r) => r.lambdaHome)),
        lambdaAway: median(runs.map((r) => r.lambdaAway)),
        pMain: median(runs.map((r) => r.pMain)),
        conf: median(runs.map((r) => r.conf)),
        pick: runs[0].pick,
        note: runs[0].note,
      } as MemberEstimate;
    }),
  );

  const members = settled
    .filter((r): r is PromiseFulfilledResult<MemberEstimate> => r.status === "fulfilled")
    .map((r) => r.value);
  if (!members.length) throw new Error("Nijedan model ansambla nije vratio valjanu procjenu.");

  const maxDev = Math.max(0.05, a.outlier / 100);
  const pAgg = robustMean(members.map((m) => m.pMain), maxDev);
  const lhAgg = robustMean(members.map((m) => m.lambdaHome), 0.9);
  const laAgg = robustMean(members.map((m) => m.lambdaAway), 0.9);

  // time-decay / vaganje po pouzdanosti članova
  let pEnsemble = pAgg.value;
  if (sp.modes.decay) {
    const w = confWeightedMean(members.map((m) => m.pMain), members.map((m) => m.conf), sp.confGamma);
    if (Number.isFinite(w)) pEnsemble = 0.5 * pEnsemble + 0.5 * w;
  }

  let lh = lhAgg.value;
  let la = laAgg.value;
  // shrinkage λ prema prosjeku lige
  if (a.leaguePrior && a.shrink > 0) {
    const tot = lh + la;
    const k = a.shrink;
    const scale = ((1 - k) * tot + k * priorTotal) / Math.max(0.2, tot);
    lh *= scale;
    la *= scale;
  }

  // tržišna sidra iz kvota u tekstu (potrebna i za Elo/λ rotaciju)
  const odds = parseOdds(userText, market);
  const pMarket =
    odds.main && odds.alt ? devig(odds.main, odds.alt) : odds.main ? Math.min(0.97, 1 / odds.main / 1.06) : null;
  const homeShare = market === "1x2" && pMarket !== null ? pMarket : null;

  // ── PIPELINE SUPER TOČNOSTI (hijerarhija, Elo, zero-inflation, overdispersion, HT/FT)
  const pipe = runSuperPipeline(
    {
      lambdaHome: lh,
      lambdaAway: la,
      leagueTotal: priorTotal,
      sampleSize: Math.max(2, members.length * Math.max(1, a.passes)),
      tau: a.tau,
      rho: a.rho,
      homeShareFromOdds: homeShare,
      eloDiff: parseEloDiff(`${userText} ${ctx}`),
      mcIters: a.mc,
    },
    sp,
  );
  lh = pipe.lambdaHome;
  la = pipe.lambdaAway;

  const probs = marketProbs(pipe.matrix, a.tau, a.rho);
  let pMatrix = probForMarket(probs, market);
  // egzaktne HT/FT i HT vrijednosti imaju prednost kad je modul aktivan
  if (pipe.htft && market === "htft") pMatrix = pipe.htft.probs["1/1"];
  if (pipe.htft && market === "htx") pMatrix = pipe.htft.htDraw;
  if (sp.modes.htft9 && market === "htgoals") pMatrix = pipe.ht.over05;

  // 55% vlastita matrica / 45% konsenzus modela (matrica je stabilnija)
  let pModel = 0.55 * pMatrix + 0.45 * pEnsemble;
  pModel = shrinkToPrior(pModel, Math.min(0.25, a.shrink), 0.5);
  if (sp.modes.calib) pModel = plattCalibrate(pModel, sp.plattA, sp.plattB);

  let pMain = Math.min(0.97, Math.max(0.03, blendWithMarket(pModel, pMarket, a.marketWeight)));

  const ps = members.map((m) => m.pMain);
  const spread = Math.max(...ps) - Math.min(...ps);
  const agreement = Math.max(0, Math.min(1, 1 - spread / 0.4));
  const mc = pipe.mc;

  // ── ANTI-POGREŠKA: koherentnost matrice, Monte Carla i konsenzusa
  let coherence: CoherenceReport | null = null;
  if (sp.modes.antiError) {
    const mcRef =
      market === "ou25" ? mc.over25 : market === "btts" ? mc.btts : market === "1x2" ? mc.home : null;
    coherence = coherenceCheck(pMatrix, mcRef, pEnsemble, agreement, sp, `${userText} ${ctx}`);
    if (!coherence.ok) pMain = applyPenalty(pMain, coherence.penalty);
  }

  const v = verdict(pMain, MAIN_LABEL[market], ALT_LABEL[market], odds.main ?? null, agreement, a);
  const safer = saferAlternative(market, probs);

  const summary = members
    .map(
      (m) =>
        `- ${m.name}: P=${(m.pMain * 100).toFixed(0)}% · λ ${m.lambdaHome.toFixed(2)}–${m.lambdaAway.toFixed(2)} · pouzdanost ${(m.conf * 100).toFixed(0)}%${m.note ? ` · ${m.note}` : ""}`,
    )
    .join("\n");

  return {
    market, members,
    lambdaHome: lh, lambdaAway: la, lambdaTotal: lh + la,
    pModel, pMarket, pMain, pAlt: 1 - pMain,
    probs, mc, verdict: v, safer, agreement, spread, summary, prefs: a,
    super: sp, pipeline: pipe, coherence,
  };
}

/** Blok teksta koji se ubacuje u sistemski prompt finalnog odgovora. */
export function consensusBriefing(c: ConsensusResult | null): string {
  if (!c) return "";
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const conf =
    c.agreement >= 0.75 ? "VISOKA (modeli se slažu)" : c.agreement >= 0.5 ? "SREDNJA" : "NISKA (modeli se razilaze)";
  const p = c.probs;
  return `═══ ANSAMBL KONSENZUS v5 (${c.members.length} modela × ${c.prefs.passes} prolaza · tržište: ${MARKET_LABEL[c.market]}) ═══
λ_dom = ${c.lambdaHome.toFixed(2)} · λ_gost = ${c.lambdaAway.toFixed(2)} · λ_total = ${c.lambdaTotal.toFixed(2)}
P(model) = ${pct(c.pModel)}${c.pMarket !== null ? ` · P(tržište, de-vig) = ${pct(c.pMarket)}` : " · kvota nije zadana"} → P(konačno) = ${pct(c.pMain)}
KONAČNI TIP: ${c.verdict.pick} · sigurnost ${pct(c.verdict.p)} · minimalna isplativa kvota ${c.verdict.fairOdds.toFixed(2)}${
    c.verdict.edge !== null ? ` · edge ${c.verdict.edge.toFixed(1)}% · Kelly ${c.verdict.kelly?.toFixed(1)}%` : ""
  } · ocjena ${"★".repeat(c.verdict.stars)}${"☆".repeat(5 - c.verdict.stars)}
Filtar vrijednosti: ${c.verdict.valueOk ? "PROLAZI" : "NE PROLAZI"} — ${c.verdict.advice}
Sigurnija alternativa: ${c.safer}
Slaganje modela: ${conf} (raspon ${(c.spread * 100).toFixed(0)} pb)

PUNA TABLICA VJEROJATNOSTI (iz Dixon-Coles matrice 0..10):
1 = ${pct(p.home)} · X = ${pct(p.draw)} · 2 = ${pct(p.away)}
GG = ${pct(p.btts)} · NG = ${pct(1 - p.btts)}
Over 1.5 = ${pct(p.over15)} · Over 2.5 = ${pct(p.over25)} · Over 3.5 = ${pct(p.over35)}
HT: očekivano ${p.htGoalsExp.toFixed(2)} gola · 0 gola ${pct(p.htDist.g0)} · 1 gol ${pct(p.htDist.g1)} · 2 gola ${pct(p.htDist.g2)} · 3+ ${pct(p.htDist.g3plus)}
HT Over 0.5 = ${pct(p.htOver05)} · HT Over 1.5 = ${pct(p.htOver15)} · HT X = ${pct(p.htDraw)}
Clean sheet dom = ${pct(p.cleanSheetHome)} · gost = ${pct(p.cleanSheetAway)}
Najvjerojatniji rezultati: ${p.topScores.map((s) => `${s.score} (${pct(s.p)})`).join(", ")}
Monte Carlo (${c.prefs.mc} iteracija) kontrola: Over 2.5 ${pct(c.mc.over25)} · GG ${pct(c.mc.btts)} · 1 ${pct(c.mc.home)} · X ${pct(c.mc.draw)}
Pojedinačne procjene:
${c.summary}

PRAVILA ZA TVOJ ODGOVOR:
1) Prva rečenica = KONAČNI TIP iznad + sigurnost u % (${pct(c.verdict.p)}). Ne izmišljaj druge brojke.
2) ${c.verdict.valueOk ? "Tip prolazi filtre — preporuči ga jasno i samouvjereno." : `Tip NE prolazi filtre — jasno reci "nema dovoljno edgea za singl" i preporuči sigurniju alternativu: ${c.safer}.`}
3) Obavezno navedi λ_dom, λ_gost, λ_total, P glavnog i suprotnog ishoda, minimalnu isplativu kvotu, edge i Kelly (ako je kvota poznata).
4) Objasni opširno na hrvatskom: forma, xG/xGA, izostanci, motivacija, tempo, sudac, teren — i zašto brojke izgledaju baš tako.
5) Ne proturječi brojkama iznad; one su rezultat konsenzusa, matrice i Monte Carlo provjere.

${superBriefing(c.pipeline, c.coherence, c.super)}

═══ VRHUNSKO RAZMIŠLJANJE (obavezan lanac prije odgovora) ═══
A) Provjeri jesu li λ, matrica i konsenzus međusobno koherentni; ako nisu, jasno reci koliko je nesigurnost veća.
B) Navedi 2 najjača argumenta ZA tip i 1 najjači argument PROTIV (devil's advocate).
C) Navedi scenarij koji ruši tip (rana crvena, gol u prvih 10 min, rotacija sastava).
D) Zaključi jednom rečenicom: tip, sigurnost, minimalna isplativa kvota.
E) Ako ANTI-POGREŠKA javlja upozorenje, NE forsiraj singl — ponudi sigurniju varijantu i traži podatke koji nedostaju.`;
}
