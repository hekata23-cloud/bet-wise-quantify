import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings, Eye, EyeOff, TestTube2, Check, Download, ExternalLink, Brain, Sparkles, Zap, Mic, Volume2 } from "lucide-react";
import { 
  loadHtFt, 
  saveHtFt, 
  computeHtFt, 
  DEFAULT_HTFT, 
  HTFT_MODULES, 
  type HtFtPrefs, 
  type HtFtModuleId 
} from "@/lib/htft";
import { loadGoalFormula, saveGoalFormula, computeGoalFormula, DEFAULT_GOAL_FORMULA, type GoalFormulaPrefs } from "@/lib/goalformula";
import {
  loadVoicePrefs,
  saveVoicePrefs,
  DEFAULT_VOICE,
  listVoices,
  warmUpVoices,
  speak,
  stopSpeaking,
  type VoicePrefs,
} from "@/lib/voice";
import { getKey, setKey, loadJSON, saveJSON, type ApiKeyName } from "@/lib/storage";
import { testGemini } from "@/lib/gemini";
import { testGroq } from "@/lib/groq";
import { testApiFootball } from "@/lib/api-football";
import { testFootballData } from "@/lib/football-data";
import { testOpenRouter, OR_MODELS } from "@/lib/openrouter";
import { testHuggingface, HF_MODELS } from "@/lib/huggingface";
import { testNvidia, NIM_MODELS } from "@/lib/nvidia";
import {
  loadOmni, saveOmni, DEFAULT_OMNI, OMNI_BRAIN_LABEL, type OmniPrefs, type OmniBrain,
} from "@/lib/omni";
import {
  SPECIALISTS,
  specKey,
  MARKET_LABEL,
  loadActiveSpecialists,
  saveActiveSpecialists,
} from "@/lib/specialists";
import { downloadProjectZip } from "@/lib/download-project";
import { loadAccuracy, saveAccuracy, DEFAULT_ACCURACY, type AccuracyPrefs } from "@/lib/accuracy";
import {
  SUPER_MODES, loadSuper, saveSuper, DEFAULT_SUPER, type SuperPrefs, type ModeId,
} from "@/lib/superaccuracy";
import {
  loadAntiError, saveAntiError, DEFAULT_ANTIERROR, type AntiErrorPrefs,
} from "@/lib/antierror";
import {
  SNIPER_FILTERS, loadSniper, saveSniper, DEFAULT_SNIPER, sniperActiveCount,
  type SniperPrefs, type SniperId,
} from "@/lib/sniper";
import { MARKET_LABEL as SNIPER_MARKET_LABEL } from "@/lib/specialists";
import {
  TITAN_MODULES, loadTitan, saveTitan, DEFAULT_TITAN, titanActiveCount,
  type TitanPrefs, type TitanId,
} from "@/lib/titan";
import {
  loadMastermind, saveMastermind, DEFAULT_MASTERMIND, LEVEL_LABEL, activateEverything,
  type MastermindPrefs, type MasterLevel,
} from "@/lib/mastermind";
import {
  QUANTUM_MODULES, loadQuantum, saveQuantum, DEFAULT_QUANTUM, quantumActiveCount,
  type QuantumPrefs, type QuantumId,
} from "@/lib/quantum";
import { InstallApp } from "@/components/InstallApp";
import { toast } from "sonner";

interface BrainPrefs {
  primary?: "openrouter" | "gemini" | "groq" | "huggingface" | "nvidia";
  orModel?: string;
  hfModel?: string;
  nimModel?: string;
  prioritizeSpecialists?: boolean;
  ensemble?: boolean;
  turbo?: boolean;
}

export const Route = createFileRoute("/postavke")({
  head: () => ({
    meta: [
      { title: "Postavke · Andromeda AI" },
      {
        name: "description",
        content: "Zalijepi Gemini, Groq i API-Football ključeve i preuzmi projekt kao ZIP.",
      },
    ],
  }),
  component: PostavkePage,
});

function PostavkePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Settings className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Postavke</h1>
          <p className="text-sm text-muted-foreground">
            Ključevi se čuvaju samo u tvom pregledniku (localStorage). Ništa ne šaljemo na server.
          </p>
        </div>
      </header>

      <KeyCard
        name="gemini"
        title="Google Gemini API"
        subtitle="Primarni AI mozak — Gemini Flash (najnovija verzija) · auto-prelazak na 2.5 Flash / Flash-Lite"
        href="https://aistudio.google.com/app/apikey"
        hrefLabel="Nabavi Gemini ključ"
        tester={testGemini}
      />
      <KeyCard
        name="groq"
        title="Groq API"
        subtitle="Fallback mozak — Llama 3.3 70B Versatile · oblik gsk_… · rezerve: Llama 3.1 8B, GPT-OSS"
        href="https://console.groq.com/keys"
        hrefLabel="Nabavi Groq ključ"
        tester={testGroq}
      />
      <KeyCard
        name="apiFootball"
        title="API-Football"
        subtitle="Podaci o utakmicama · ugrađeno keširanje i throttling da izbjegneš suspenziju"
        href="https://dashboard.api-football.com/register"
        hrefLabel="Nabavi API-Football ključ"
        tester={testApiFootball}
      />

      <KeyCard
        name="footballData"
        title="football-data.org"
        subtitle="Dodatni besplatni izvor · 10 zahtjeva/min · ide kroz naš proxy pa nema 'Failed to fetch'"
        href="https://www.football-data.org/client/register"
        hrefLabel="Nabavi football-data ključ"
        tester={testFootballData}
      />

      <KeyCard
        name="openrouter"
        title="OpenRouter (preporučeno)"
        subtitle="Besplatni modeli · oblik sk-or-v1-… · desetci specijalista uz automatski lanac rezervi"
        href="https://openrouter.ai/keys"
        hrefLabel="Nabavi OpenRouter ključ"
        tester={testOpenRouter}
      />

      <KeyCard
        name="nvidia"
        title="NVIDIA NIM (preporučeno)"
        subtitle="Neograničen besplatni mozak · oblik nvapi-… · 18 besplatnih modela za nogometne predikcije (ide kroz naš proxy)"
        href="https://build.nvidia.com/explore/discover"
        hrefLabel="Nabavi NVIDIA NIM ključ"
        tester={testNvidia}
        recommended
        activateBrain="nvidia"
      />

      <KeyCard
        name="huggingface"
        title="Hugging Face Inference"
        subtitle="Dodatni mozak · besplatan tier · oblik hf_…"
        href="https://huggingface.co/settings/tokens"
        hrefLabel="Nabavi HF token"
        tester={testHuggingface}
      />

      <BrainRouter />
      <HtFtPanel />
      <GoalFormulaPanel />
      <QuantumPanel />
      <MastermindPanel />
      <OmniPanel />
      <AntiErrorPanel />
      <SniperPanel />
      <TitanPanel />
      <SuperModesPanel />
      <VoicePanel />
      <AccuracyPanel />
      <SpecialistsPanel />

      <InstallApp />

      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="text-lg font-semibold">Preuzmi projekt (ZIP)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pakira cijeli izvorni kod (src/, public/, package.json, config) u ZIP i preuzima ga.
        </p>
        <button
          onClick={async () => {
            try {
              await downloadProjectZip();
              toast.success("ZIP je preuzet.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Greška pri pakiranju.");
            }
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          <Download className="h-4 w-4" /> Preuzmi andromeda-ai.zip
        </button>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground mb-2">Zaštita od API-Football suspenzije</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Lokalni keš svih odgovora s TTL-om (5–10 min).</li>
          <li>Throttling: min 2 sekunde između zahtjeva.</li>
          <li>Dnevni limit od 90 zahtjeva (ispod free plana 100/dan).</li>
          <li>Deduplikacija paralelnih identičnih poziva.</li>
          <li>Retry samo jednom, samo na 429, uz 3s backoff.</li>
        </ul>
      </section>
    </div>
  );
}

function HtFtPanel() {
  const [p, setP] = useState<HtFtPrefs>(DEFAULT_HTFT);
  useEffect(() => setP(loadHtFt()), []);
  function upd(patch: Partial<HtFtPrefs>) {
    const next = { ...p, ...patch };
    setP(next);
    saveHtFt(next);
  }

  const r = computeHtFt(p);

  const toggle = (id: HtFtModuleId) => {
    const nextOn = { ...p.on, [id]: !p.on[id] };
    upd({ on: nextOn });
  };

  const knob = (label: string, key: keyof HtFtPrefs, min: number, max: number, step: number, hint: string) => (
    <label key={String(key)} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(p[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as unknown as Partial<HtFtPrefs>)}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <section className="rounded-2xl border border-orange-500/40 bg-orange-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-orange-400">
          <Zap className="h-5 w-5" /> HT/FT Majstor v14
        </h2>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => {
              upd({ enabled: e.target.checked });
              toast.success(e.target.checked ? "HT/FT Majstor aktiviran." : "HT/FT Majstor isključen.");
            }}
            className="h-5 w-5 accent-orange-500"
          />
          UKLJUČENO
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Vrhunski modul za poluvrijeme/kraj i točne rezultate. Koristi razdvojene λ po poluvremenima (HT matrica 0-4, FT 0-6) 
        i Dixon-Coles kalibraciju. Chat bot ovo obavezno konzultira za HT/FT tržišta.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {knob("Prag pouzdanosti (%)", "minConfidence", 30, 95, 1, "Ispod ovoga nudi sigurniju liniju.")}
        {knob("Udio golova u 1. pol. (%)", "firstHalfShare", 0.30, 0.60, 0.01, "Obično 0.44 - 0.47.")}
        {knob("Max p za točan rez. (%)", "maxScoreProb", 5, 30, 1, "Odbacuje prenapuhane vjerojatnosti rezultata.")}
        {knob("Broj top rezultata", "topScoresCount", 1, 10, 1, "Koliko točnih rezultata prikazati botu.")}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {HTFT_MODULES.map((m) => (
          <button
            key={m.id}
            onClick={() => toggle(m.id)}
            className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
              p.on[m.id] ? "border-orange-500/60 bg-orange-500/10" : "border-border/60 bg-background/40 opacity-60"
            }`}
          >
            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${p.on[m.id] ? "text-orange-400" : "text-transparent"}`} />
            <span>
              <span className="block text-xs font-semibold">{m.label}</span>
              <span className="block text-[10px] text-muted-foreground leading-tight">{m.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-orange-500/30 bg-background/50 p-4 text-sm">
        <div className="grid gap-2 grid-cols-3 tabular-nums">
          {r.combos.map((c) => (
            <div key={c.combo} className="text-xs">
              <span className="text-muted-foreground">{c.combo}:</span> <span className="font-mono text-orange-400">{c.p}%</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-border/40 pt-2 grid gap-2 sm:grid-cols-3 tabular-nums text-[10px] text-muted-foreground uppercase">
          <div>Ishod 1: {r.p1}%</div>
          <div>Ishod X: {r.pX}%</div>
          <div>Ishod 2: {r.p2}%</div>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground border-t border-border/40 pt-2">
          TOP REZULTATI: {r.scores.map((s) => `${s.score} (${s.p}%)`).join(" · ")}
        </div>
        <div className="mt-3 text-sm font-semibold">
          Preporuka Majstora: <span className="text-orange-400">{r.topCombo}</span> ({r.confidence}%)
          {r.skip && <span className="ml-2 text-xs text-destructive font-normal">(ISPOD PRAGA)</span>}
        </div>
      </div>
      <button
        onClick={() => {
          setP(DEFAULT_HTFT);
          saveHtFt(DEFAULT_HTFT);
          toast.success("Vraćeno na preporučene postavke.");
        }}
        className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
      >
        Vrati zadano
      </button>
    </section>
  );
}

function GoalFormulaPanel() {
  const [p, setP] = useState<GoalFormulaPrefs>(DEFAULT_GOAL_FORMULA);
  useEffect(() => setP(loadGoalFormula()), []);
  function upd(patch: Partial<GoalFormulaPrefs>) {
    const next = { ...p, ...patch };
    setP(next);
    saveGoalFormula(next);
  }
  const r = computeGoalFormula(p);
  const num = (label: string, key: keyof GoalFormulaPrefs, step = 0.05, hint?: string) => (
    <label key={String(key)} className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as unknown as Partial<GoalFormulaPrefs>)}
        className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm tabular-nums"
      />
      {hint ? <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span> : null}
    </label>
  );

  return (
    <section className="rounded-2xl border border-primary/40 bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="h-5 w-5 text-primary" /> Napredna formula — BTTS i Over/Under 2.5
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Poissonova matrica 0–8 s Dixon-Coles korekcijom. Uključi ju ručno; dok je uključena, chat bot ju
        obavezno uzima u obzir kod donošenja tipa za BTTS i Over/Under 2.5.
      </p>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => {
            upd({ enabled: e.target.checked });
            toast.success(e.target.checked ? "Napredna formula je aktivirana." : "Formula je isključena.");
          }}
          className="h-4 w-4"
        />
        <strong>Ručno aktiviraj formulu</strong>
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {num("Domaćin zabija (prosjek)", "homeFor")}
        {num("Domaćin prima", "homeAgainst")}
        {num("Gost zabija", "awayFor")}
        {num("Gost prima", "awayAgainst")}
        {num("Prosjek lige (golova)", "leagueAvg")}
        {num("Prednost domaćeg terena", "homeAdvantage", 0.01)}
        {num("Dixon-Coles ρ", "rho", 0.01, "niski rezultati; obično −0.05 do 0")}
        {num("Prag sigurnosti (%)", "minConfidence", 1, "ispod praga formula savjetuje preskok")}
        {num("Kvota BTTS DA", "oddsBtts", 0.01, "0 = bez računa vrijednosti")}
        {num("Kvota Over 2.5", "oddsOver25", 0.01, "0 = bez računa vrijednosti")}
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-background/50 p-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-3 tabular-nums">
          <div>λ domaćin: <span className="font-mono text-primary">{r.lambdaHome}</span></div>
          <div>λ gost: <span className="font-mono text-primary">{r.lambdaAway}</span></div>
          <div>Ukupno golova: <span className="font-mono text-primary">{r.total}</span></div>
          <div>BTTS DA: <span className="font-mono text-primary">{r.pBtts}%</span></div>
          <div>Over 2.5: <span className="font-mono text-primary">{r.pOver25}%</span></div>
          <div>Under 2.5: <span className="font-mono text-primary">{r.pUnder25}%</span></div>
        </div>
        <div className="mt-3 text-sm">
          Preporuka formule: <strong className="text-primary">{r.topPick}</strong> ({r.confidence}%)
          {r.skip ? " — ispod praga, preporuka je preskočiti." : ""}
        </div>
        {r.edgeBtts !== null || r.edgeOver !== null ? (
          <div className="mt-1 text-xs text-muted-foreground">
            {r.edgeBtts !== null ? `Edge BTTS: ${r.edgeBtts}% · ` : ""}
            {r.edgeOver !== null ? `Edge Over 2.5: ${r.edgeOver}%` : ""}
          </div>
        ) : null}
      </div>
      <button
        onClick={() => {
          setP(DEFAULT_GOAL_FORMULA);
          saveGoalFormula(DEFAULT_GOAL_FORMULA);
          toast.success("Formula vraćena na zadano.");
        }}
        className="mt-3 rounded-lg border border-input px-3 py-1.5 text-xs hover:bg-muted"
      >
        Vrati zadano
      </button>
    </section>
  );
}

function QuantumPanel() {
  const [p, setP] = useState<QuantumPrefs>(DEFAULT_QUANTUM);
  useEffect(() => setP(loadQuantum()), []);
  function update(next: QuantumPrefs) {
    setP(next);
    saveQuantum(next);
  }
  const toggle = (id: QuantumId) =>
    update({ ...p, on: { ...p.on, [id]: !p.on[id] } });
  const active = quantumActiveCount(p);

  return (
    <section className="rounded-2xl border border-primary/40 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="h-5 w-5 text-primary" /> Kvantna točnost v12 (napredno)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Novi sloj kalibracije i provjere. Automatski se povezuje na svaki odgovor chat bota —
            radi za sva tržišta, uz sve postojeće module. Aktivno: {active}/{QUANTUM_MODULES.length}.
          </p>
        </div>
        <button
          onClick={() => update({ ...p, enabled: !p.enabled })}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${p.enabled ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-muted-foreground"}`}
        >
          {p.enabled ? "UKLJUČENO" : "isključeno"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm">
          <span>Automatski aktivno u chatu</span>
          <input
            type="checkbox"
            checked={p.autoAttach}
            onChange={() => update({ ...p, autoAttach: !p.autoAttach })}
            className="h-4 w-4 accent-[oklch(0.585_0.232_25.5)]"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm">
          <span>Sam pokreni motore (OMNI + ansambl)</span>
          <input
            type="checkbox"
            checked={p.autoEngines}
            onChange={() => update({ ...p, autoEngines: !p.autoEngines })}
            className="h-4 w-4 accent-[oklch(0.585_0.232_25.5)]"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <NumField
          label="Min. sigurnost (%)"
          value={p.minConfidence}
          min={50}
          max={95}
          onChange={(v) => update({ ...p, minConfidence: v })}
        />
        <NumField
          label="Max. razilaženje (pb)"
          value={p.maxDivergencePb}
          min={2}
          max={25}
          onChange={(v) => update({ ...p, maxDivergencePb: v })}
        />
        <NumField
          label="Težina tržišta (%)"
          value={p.marketWeight}
          min={0}
          max={80}
          onChange={(v) => update({ ...p, marketWeight: v })}
        />
      </div>

      <div className="mt-4 space-y-2">
        {QUANTUM_MODULES.map((m) => (
          <button
            key={m.id}
            onClick={() => toggle(m.id)}
            className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${p.on[m.id] ? "border-primary/40 bg-primary/10" : "border-border/60 bg-secondary/30"}`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded ${p.on[m.id] ? "bg-primary text-primary-foreground" : "border border-border"}`}
            >
              {p.on[m.id] ? <Check className="h-3 w-3" /> : null}
            </span>
            <span>
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => update(DEFAULT_QUANTUM)}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Uključi sve (preporučeno)
        </button>
        <button
          onClick={() => {
            const off = { ...p.on };
            (Object.keys(off) as QuantumId[]).forEach((k) => (off[k] = false));
            update({ ...p, on: off });
          }}
          className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm hover:bg-secondary/80"
        >
          Isključi sve module
        </button>
      </div>
    </section>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}

function BrainRouter() {
  const [prefs, setPrefs] = useState<BrainPrefs>(() =>
    loadJSON<BrainPrefs>("tm.brain.prefs", { primary: "openrouter", prioritizeSpecialists: true }),
  );

  function save(next: BrainPrefs) {
    setPrefs(next);
    saveJSON("tm.brain.prefs", next);
    toast.success("Mozak konfiguriran.");
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Router mozgova</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Odaberi primarni mozak i model. Ako primarni padne, Andromeda AI automatski prelazi na sljedeći dostupan.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-muted-foreground">Primarni mozak</span>
          <select
            value={prefs.primary ?? "openrouter"}
            onChange={(e) => save({ ...prefs, primary: e.target.value as BrainPrefs["primary"] })}
            className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
          >
            <option value="openrouter">OpenRouter (preporučeno)</option>
            <option value="gemini">Google Gemini Flash</option>
            <option value="groq">Groq (Llama 3.3 70B Versatile)</option>
            <option value="nvidia">NVIDIA NIM (preporučeno)</option>
            <option value="huggingface">Hugging Face</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">OpenRouter model</span>
          <select
            value={prefs.orModel ?? OR_MODELS[0].id}
            onChange={(e) => save({ ...prefs, orModel: e.target.value })}
            className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
          >
            {OR_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.free ? "🆓 " : ""}
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">NVIDIA NIM model</span>
          <select
            value={prefs.nimModel ?? NIM_MODELS[0].id}
            onChange={(e) => save({ ...prefs, nimModel: e.target.value })}
            className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
          >
            {NIM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                🆓 {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-muted-foreground">Hugging Face model</span>
          <select
            value={prefs.hfModel ?? HF_MODELS[0].id}
            onChange={(e) => save({ ...prefs, hfModel: e.target.value })}
            className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
          >
            {HF_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.prioritizeSpecialists ?? true}
          onChange={(e) => save({ ...prefs, prioritizeSpecialists: e.target.checked })}
          className="h-4 w-4"
        />
        Daj prioritet specijalistima za nogomet
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.ensemble ?? true}
          onChange={(e) => save({ ...prefs, ensemble: e.target.checked })}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <strong>Super točnost — ansambl konsenzus</strong>
          <span className="block text-xs text-muted-foreground">
            Više modela paralelno računa λ i P, medijan odbacuje outliere, pa se rezultat kalibrira neovisnim
            Poissonovim izračunom. Sporije za par sekundi, ali znatno točnije za BTTS i Over/Under.
          </span>
        </span>
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.turbo ?? false}
          onChange={(e) => save({ ...prefs, turbo: e.target.checked })}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <strong>Brzi odgovori (Turbo)</strong>
          <span className="block text-xs text-muted-foreground">
            Svi moduli i dalje rade, ali se pozivi manje ponavljaju: 1 prolaz po modelu, ansambl do 3 člana i
            kraći odgovori motora. Ako pomoćni motor kasni, odgovor ide dalje bez njegovog briefinga.
          </span>
        </span>
      </label>

    </section>
  );
}


function SuperModesPanel() {
  const [p, setP] = useState<SuperPrefs>(DEFAULT_SUPER);
  useEffect(() => setP(loadSuper()), []);
  function upd(patch: Partial<SuperPrefs>) {
    const next = { ...p, ...patch };
    setP(next);
    saveSuper(next);
  }
  function toggle(id: ModeId) {
    const modes = { ...p.modes, [id]: !p.modes[id] };
    upd({ modes });
    toast.success(modes[id] ? "Verzija super točnosti aktivirana." : "Verzija isključena.");
  }
  const knob = (
    label: string,
    key: keyof SuperPrefs,
    min: number,
    max: number,
    step: number,
    hint: string,
  ) => (
    <label key={String(key)} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(p[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as unknown as Partial<SuperPrefs>)}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
  const onCount = SUPER_MODES.filter((m) => p.modes[m.id]).length;

  return (
    <section className="rounded-2xl border border-primary/50 bg-primary/5 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" /> Verzije super točnosti (v6 / v7)
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">{onCount} aktivnih</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const modes = SUPER_MODES.reduce((a, m) => ({ ...a, [m.id]: true }), {} as Record<ModeId, boolean>);
              upd({ modes });
              toast.success("Sve verzije super točnosti aktivirane.");
            }}
            className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
          >
            Uključi sve
          </button>
          <button
            onClick={() => {
              setP(DEFAULT_SUPER);
              saveSuper(DEFAULT_SUPER);
              toast.success("Vraćeno na preporučeno.");
            }}
            className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
          >
            Vrati preporučeno
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Svaka verzija stvarno mijenja matematiku predikcije i ono što bot dobije u briefingu prije odgovora —
        nije kozmetika. Uključi ih sve za maksimalnu točnost, ili biraj po tržištu.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {SUPER_MODES.map((m) => {
          const on = !!p.modes[m.id];
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`rounded-xl border p-3 text-left transition ${
                on ? "border-primary/60 bg-primary/10" : "border-border/60 bg-background/40 opacity-70"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-primary">{m.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    on ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {on ? "AKTIVNO" : "isključeno"}
                </span>
              </div>
              <div className="mt-1 text-xs text-foreground/80">{m.desc}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{m.detail}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {m.markets.map((mk) => (
                  <span key={mk} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {MARKET_LABEL[mk]}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <h3 className="pt-2 text-sm font-semibold">Postavke koje stvarno rade</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {knob("Hijerarhijski Bayes — pseudo-uzorak k", "hierK", 1, 20, 1, "Veći k = jače povlačenje prema prosjeku lige.")}
        {knob("Poluživot forme (dana)", "halfLifeDays", 10, 120, 5, "Utakmica starija od ovoga vrijedi manje od pola.")}
        {knob("Vaganje pouzdanosti modela γ", "confGamma", 0.5, 3, 0.1, "Veći γ = više se sluša model koji je siguran u podatke.")}
        {knob("Elo/kvota → λ jačina", "eloPull", 0, 1, 0.05, "Koliko se λ omjer rotira prema tržišnoj snazi.")}
        {knob("Zero-inflation π", "zeroInflate", 0, 0.12, 0.005, "Dodatna masa na 0:0 — ključno za NG i Under.")}
        {knob("Overdispersion k", "dispK", 4, 40, 1, "Manji k = veća varijanca golova (realnije za kaotične lige).")}
        {knob("Platt a (nagib)", "plattA", 0.6, 1.4, 0.02, "a < 1 kroti prenapuhane postotke.")}
        {knob("Platt b (pomak)", "plattB", -0.6, 0.6, 0.02, "Ispravlja sustavni nagib prema favoritima.")}
        {knob("Split λ prvog poluvremena", "htSplit", 0.35, 0.5, 0.01, "Udio golova do odmora — baza za HT/FT i HT golove.")}
        {knob("ANTI-POGREŠKA tolerancija (pb)", "coherenceTol", 2, 15, 1, "Iznad ovoga bot smanjuje sigurnost i nudi sigurniji tip.")}
        {knob("Minimalno slaganje modela", "minAgreement", 0.2, 0.8, 0.05, "Ispod ovoga tip se degradira umjesto da se forsira.")}
      </div>

      <h3 className="pt-2 text-sm font-semibold">v8 — nove napredne funkcije za BTTS i Over/Under 2.5</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {knob("BTTS korelacija golova ρ (kopula)", "bttsRho", -0.35, 0.35, 0.01, "− = timovi se guše (NG), + = gol izaziva gol (GG).")}
        {knob("O/U game-state β", "ouBeta", -0.5, 0.5, 0.05, "− = favorit zatvara utakmicu (Under), + = juriš na gol (Over).")}
        {knob("Nagib golova prema kraju", "lateSkew", 0, 0.4, 0.02, "Koliko je zadnja trećina golonosnija od prve.")}
        {knob("Kelly frakcija", "kellyFraction", 0.1, 1, 0.05, "0.25 = četvrtinski Kelly; nikad više od 5% banke.")}
        <label className="block text-xs">
          <span className="text-muted-foreground">Metoda uklanjanja marže (de-vig)</span>
          <select
            value={p.devig}
            onChange={(e) => upd({ devig: e.target.value as SuperPrefs["devig"] })}
            className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
          >
            <option value="shin">Shin (insajderski novac) — najtočnije</option>
            <option value="power">Power (favorit/autsajder bias)</option>
            <option value="mult">Multiplikativni (jednostavni)</option>
          </select>
          <span className="text-[10px] text-muted-foreground">Koristi se za edge, value i Kelly izračun.</span>
        </label>
      </div>
    </section>
  );
}

function VoicePanel() {
  const [v, setV] = useState<VoicePrefs>(DEFAULT_VOICE);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    setV(loadVoicePrefs());
    warmUpVoices();
    const load = () => setVoices(listVoices());
    load();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);
  function upd(patch: Partial<VoicePrefs>) {
    const next = { ...v, ...patch };
    setV(next);
    saveVoicePrefs(next);
  }
  const slider = (label: string, key: "rate" | "pitch" | "volume", min: number, max: number, step: number, hint: string) => (
    <label key={key} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{v[key].toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v[key]}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as Partial<VoicePrefs>)}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
  return (
    <section className="rounded-2xl border border-sky-500/40 bg-sky-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Mic className="h-5 w-5 text-sky-400" />
        <h2 className="text-lg font-semibold">Glas chat bota (izvorni hrvatski)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Luna sluša i odgovara na izvornom hrvatskom jeziku. Odaberi glas, podesi brzinu, visinu i glasnoću —
        postavke se odmah primjenjuju i u chatu.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="text-muted-foreground">Glas (preporučeni hrvatski su na vrhu)</span>
          <select
            value={v.voiceURI}
            onChange={(e) => upd({ voiceURI: e.target.value })}
            className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
          >
            <option value="">Automatski — najbolji hrvatski ženski glas</option>
            {voices.map((vo) => (
              <option key={vo.voiceURI} value={vo.voiceURI}>
                {vo.name} ({vo.lang})
              </option>
            ))}
          </select>
          <span className="text-[10px] text-muted-foreground">
            Ako nema hrvatskog glasa, instaliraj hrvatski jezični paket u sustavu (Windows: Postavke → Vrijeme i jezik → Govor).
          </span>
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Jezik prepoznavanja govora</span>
          <select
            value={v.sttLang}
            onChange={(e) => upd({ sttLang: e.target.value })}
            className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
          >
            <option value="hr-HR">Hrvatski (hr-HR)</option>
            <option value="bs-BA">Bosanski (bs-BA)</option>
            <option value="sr-RS">Srpski (sr-RS)</option>
            <option value="sl-SI">Slovenski (sl-SI)</option>
            <option value="en-US">Engleski (en-US)</option>
          </select>
          <span className="text-[10px] text-muted-foreground">Bot uvijek odgovara hrvatski, bez obzira na jezik pitanja.</span>
        </label>
        {slider("Brzina govora", "rate", 0.6, 1.6, 0.02, "Niže = sporije i razgovjetnije.")}
        {slider("Visina glasa", "pitch", 0.6, 1.8, 0.02, "Više = ženskiji, mekši ton.")}
        {slider("Glasnoća", "volume", 0.1, 1, 0.05, "Glasnoća izgovorenog odgovora.")}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={v.autoSpeak} onChange={(e) => upd({ autoSpeak: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>
            Automatski izgovori svaki odgovor
            <span className="block text-xs text-muted-foreground">Glasovni način u chatu se uključuje sam pri otvaranju.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={v.continuous} onChange={(e) => upd({ continuous: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>
            Kontinuirano slušanje
            <span className="block text-xs text-muted-foreground">Za duže diktate — mikrofon ne staje nakon prve pauze.</span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => speak("Bok, ja sam Luna. Ovako zvučim kad ti dajem tip na izvornom hrvatskom jeziku.")}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Volume2 className="h-4 w-4" /> Isprobaj glas
        </button>
        <button onClick={() => stopSpeaking()} className="rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-muted">
          Zaustavi
        </button>
        <button
          onClick={() => {
            setV(DEFAULT_VOICE);
            saveVoicePrefs(DEFAULT_VOICE);
            toast.success("Glas vraćen na zadano.");
          }}
          className="rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-muted"
        >
          Vrati zadano
        </button>
      </div>
    </section>
  );
}

function SpecialistsPanel() {
  return <SpecialistsPanelInner />;
}

function AccuracyPanel() {
  const [a, setA] = useState<AccuracyPrefs>(DEFAULT_ACCURACY);
  useEffect(() => setA(loadAccuracy()), []);
  function upd(patch: Partial<AccuracyPrefs>) {
    const next = { ...a, ...patch };
    setA(next);
    saveAccuracy(next);
  }
  const num = (
    label: string,
    key: keyof AccuracyPrefs,
    min: number,
    max: number,
    step: number,
    hint: string,
  ) => (
    <label key={key} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(a[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(a[key])}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as Partial<AccuracyPrefs>)}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
  return (
    <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-emerald-400" />
        <h2 className="text-lg font-semibold">Super točnost — napredne postavke (v5)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Fino podešavanje motora predikcija: koliko modela računa paralelno, koliko puta ponavljaju izračun, koliko se
        vjeruje kvotama i koliko strogi su filtri prije nego Luna uopće da tip.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {num("Članova ansambla", "members", 3, 9, 1, "Više modela = stabilniji medijan, ali sporije.")}
        {num("Prolaza po modelu (self-consistency)", "passes", 1, 3, 1, "Svaki model računa više puta, uzima se medijan.")}
        {num("Težina tržišta (de-vig kvota)", "marketWeight", 0, 0.8, 0.02, "Koliko se konačna P povlači prema kvoti.")}
        {num("Shrinkage prema prosjeku lige", "shrink", 0, 0.45, 0.01, "Kroti ekstremne λ i prenapuhane postotke.")}
        {num("Dixon-Coles τ", "tau", 0, 0.2, 0.01, "Korekcija 0:0, 1:0, 0:1, 1:1 — ključna za GG/NG.")}
        {num("Korelacija golova ρ", "rho", -0.12, 0.12, 0.01, "Negativna = timovi se međusobno guše.")}
        {num("Minimalni edge (%)", "minEdge", 0, 15, 0.5, "Ispod ovoga Luna kaže da nema value.")}
        {num("Prag sigurnosti (%)", "minConfidence", 50, 75, 1, "Ispod ovoga nudi sigurniju alternativu.")}
        {num("Odbaci outliere iznad (pb)", "outlier", 5, 30, 1, "Model koji odskače od medijana ispada iz računa.")}
        {num("Monte Carlo iteracija", "mc", 2000, 60000, 1000, "Neovisna simulacijska provjera matrice.")}
        {num("Kelly frakcija", "kellyFraction", 0.1, 1, 0.05, "0.25 = četvrt Kelly (preporučeno).")}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={a.conservative} onChange={(e) => upd({ conservative: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>
            <strong>Konzervativni način</strong>
            <span className="block text-xs text-muted-foreground">Strože pragove i uvijek nudi sigurniju varijantu tipa.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={a.leaguePrior} onChange={(e) => upd({ leaguePrior: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>
            <strong>Prosjeci liga kao prior</strong>
            <span className="block text-xs text-muted-foreground">Kad fale podaci, λ se povlači prema stvarnom prosjeku te lige.</span>
          </span>
        </label>
      </div>
      <button
        onClick={() => {
          setA(DEFAULT_ACCURACY);
          saveAccuracy(DEFAULT_ACCURACY);
          toast.success("Vraćeno na preporučene vrijednosti.");
        }}
        className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
      >
        Vrati preporučeno
      </button>
    </section>
  );
}

function SpecialistsPanelInner() {
  const [active, setActive] = useState<Record<string, boolean>>({});
  useEffect(() => setActive(loadActiveSpecialists()), []);

  function toggle(id: string) {
    const next = { ...active, [id]: !active[id] };
    setActive(next);
    saveActiveSpecialists(next);
    toast.success(next[id] ? "Specijalist aktiviran." : "Specijalist isključen.");
  }

  function setAll(on: boolean) {
    const next: Record<string, boolean> = {};
    for (const s of SPECIALISTS) next[specKey(s)] = on;
    setActive(next);
    saveActiveSpecialists(next);
    toast.success(on ? "Svi specijalisti aktivirani." : "Svi isključeni.");
  }

  const onCount = SPECIALISTS.filter((s) => active[specKey(s)]).length;
  const general = SPECIALISTS.filter((s) => !s.group);
  const gol = SPECIALISTS.filter((s) => s.group === "gol");
  const elite = SPECIALISTS.filter((s) => s.group === "elite");
  const htft = SPECIALISTS.filter((s) => s.group === "htft");

  const card = (s: (typeof SPECIALISTS)[number]) => {
    const key = specKey(s);
    const on = !!active[key];
    return (
      <button
        key={key}
        onClick={() => toggle(key)}
        className={`rounded-lg border p-3 text-left transition ${
          on ? "border-primary/60 bg-primary/5" : "border-border/60 bg-background/40 opacity-70"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Brain className="h-4 w-4" /> {s.name}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {on ? "Aktivan" : "Isključen"}
          </span>
          {s.markets.map((m) => (
            <span key={m} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {MARKET_LABEL[m]}
            </span>
          ))}
        </div>
      </button>
    );
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Specijalisti za nogometne predikcije
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">{onCount} aktivnih</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setAll(true)} className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted">
            Uključi sve
          </button>
          <button onClick={() => setAll(false)} className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted">
            Isključi sve
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Besplatni modeli s jakim matematičkim/logičkim rezoniranjem. Kad je "Daj prioritet specijalistima" uključeno, chat
        sam prepozna tip koji tražiš (1X2, BTTS, Over/Under 2.5, HT/FT, X na poluvremenu, golovi na poluvremenu) i pošalje
        pitanje specijalistu za baš to tržište — uz modul razmišljanja s formulama za taj tip.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{general.map(card)}</div>

      <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <h3 className="text-sm font-semibold text-primary">
          ⚽ GOL-specijalisti — BTTS (GG/NG) i Over/Under 2.5
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Zaseban odjeljak besplatnih modela treniranih za gol tržišta. Kad su aktivni, chat ih stavlja na prvo mjesto
          čim prepozna pitanje o BTTS-u, Over/Under 2.5 ili golovima na poluvremenu — i vraća konkretan tip s P(%),
          edgeom i Kellyjem.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{gol.map(card)}</div>
      </div>

      <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <h3 className="text-sm font-semibold text-emerald-400">
          🎯 NAPREDNI BTTS & OVER/UNDER ANSAMBL — super točnost
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Ovi modeli rade paralelno: svaki neovisno izračuna λ_dom, λ_gost i vjerojatnost tržišta i vrati strogi JSON.
          Aplikacija zatim uzima medijan, odbacuje odstupanja veća od 15 postotnih bodova i kalibrira rezultat vlastitim
          Poisson/Dixon-Coles izračunom. Uključi "Super točnost" gore da chat koristi ovaj ansambl.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{elite.map(card)}</div>
      </div>

      <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <h3 className="text-sm font-semibold text-amber-400">
          ⏱️ NAPREDNI HT/FT & POLUVRIJEME ANSAMBL — super točnost
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Zaseban ansambl za poluvrijeme/kraj, X na poluvremenu i golovi do odmora. Modeli odvojeno računaju λ prvog i
          drugog poluvremena, a aplikacija ih spaja s egzaktnom HT/FT matricom od 9 kombinacija (modul „v7 · HT/FT puna
          matrica“ gore).
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{htft.map(card)}</div>
      </div>
    </section>
  );
}

function KeyCard({
  name,
  title,
  subtitle,
  href,
  hrefLabel,
  tester,
  recommended,
  activateBrain,
}: {
  name: ApiKeyName;
  title: string;
  subtitle: string;
  href: string;
  hrefLabel: string;
  tester: () => Promise<{ ok: boolean; msg: string }>;
  recommended?: boolean;
  activateBrain?: NonNullable<BrainPrefs["primary"]>;
}) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const v = getKey(name);
    setValue(v);
    setSaved(v.length > 0);
    if (activateBrain) {
      const bp = loadJSON<BrainPrefs>("tm.brain.prefs", {});
      setActive(bp.primary === activateBrain);
    }
  }, [name, activateBrain]);

  function activate() {
    if (!activateBrain) return;
    if (!getKey(name) && !value.trim()) {
      toast.error("Prvo spremi ključ, pa aktiviraj.");
      return;
    }
    if (value.trim()) setKey(name, value);
    const bp = loadJSON<BrainPrefs>("tm.brain.prefs", {});
    saveJSON("tm.brain.prefs", { ...bp, primary: activateBrain });
    setActive(true);
    setSaved(true);
    toast.success(`${title} je sada primarni mozak.`);
  }

  function save() {
    if (!value.trim()) {
      toast.error("Zalijepi ključ.");
      return;
    }
    setKey(name, value);
    setSaved(true);
    toast.success(`${title} spremljen.`);
  }

  async function test() {
    setTesting(true);
    // Testiraj s trenutnom vrijednošću (privremeno spremi)
    const before = getKey(name);
    if (value.trim()) setKey(name, value);
    try {
      const r = await tester();
      if (r.ok) toast.success(r.msg);
      else toast.error(r.msg);
    } finally {
      // vrati stanje ako korisnik nije spremio
      if (!saved && !value.trim()) setKey(name, before);
      setTesting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {title}
            {recommended && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">preporučeno</span>
            )}
            {active && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">aktivan</span>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                <Check className="h-3 w-3" /> spremljen
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {hrefLabel} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="Zalijepi API ključ ovdje…"
            className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 font-mono"
          />
          <button
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={show ? "Sakrij" : "Prikaži"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void test()}
          disabled={testing || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs hover:bg-secondary/70 disabled:opacity-50"
        >
          <TestTube2 className="h-3.5 w-3.5" /> {testing ? "Testiram…" : "Testiraj"}
        </button>
        <button
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Check className="h-3.5 w-3.5" /> Spremi
        </button>
        {activateBrain && (
          <button
            onClick={activate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/60 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Zap className="h-3.5 w-3.5" /> {active ? "Aktivan" : "Aktiviraj"}
          </button>
        )}
      </div>
    </section>
  );
}

function MastermindPanel() {
  const [p, setP] = useState<MastermindPrefs>(DEFAULT_MASTERMIND);
  useEffect(() => setP(loadMastermind()), []);
  function upd(next: MastermindPrefs) {
    setP(next);
    saveMastermind(next);
  }
  const markets: Array<[keyof typeof MARKET_LABEL, string]> = (
    Object.entries(MARKET_LABEL) as Array<[keyof typeof MARKET_LABEL, string]>
  );
  const knob = (label: string, key: keyof MastermindPrefs, min: number, max: number, step: number, hint: string) => (
    <label key={String(key)} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(p[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ ...p, [key]: Number(e.target.value) })}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
  const flag = (label: string, key: keyof MastermindPrefs, hint: string) => (
    <label key={String(key)} className="flex items-start gap-2 rounded-xl border border-border/50 bg-background/40 p-3">
      <input
        type="checkbox"
        checked={Boolean(p[key])}
        onChange={(e) => upd({ ...p, [key]: e.target.checked })}
        className="mt-1 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  return (
    <section className="rounded-2xl border-2 border-primary bg-primary/10 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" /> MASTERMIND v11 — glavni um (ručna aktivacija)
          {p.enabled && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">AKTIVAN</span>
          )}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => upd({ ...p, enabled: e.target.checked })}
            className="h-5 w-5"
          />
          Uključi Mastermind
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Mastermind je vrhovni koordinator: kad ga uključiš, sam bira najbolje besplatne modele za tvoje pitanje, sam pali
        OMNI motor, ansambl, super točnosti, Snajper v9, ANTI-GREŠKU i Titan v10, pa sve njihove izlaze spaja u jedan
        konačan tip s jednom brojkom sigurnosti. Ništa se ne briše — tvoje ručne postavke ostaju, Mastermind ih samo
        nadograđuje u trenutku odgovora.
      </p>

      <div>
        <h3 className="text-sm font-semibold mb-2">Razina strogosti</h3>
        <div className="grid gap-2">
          {(Object.keys(LEVEL_LABEL) as MasterLevel[]).map((lv) => (
            <label
              key={lv}
              className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
                p.level === lv ? "border-primary bg-primary/10" : "border-border/50"
              }`}
            >
              <input
                type="radio"
                name="mm-level"
                checked={p.level === lv}
                onChange={() => upd({ ...p, level: lv })}
                className="h-4 w-4"
              />
              {LEVEL_LABEL[lv]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Što Mastermind smije automatski uključiti</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {flag("Automatski modeli", "autoModels", "Bira najjače besplatne modele za traženo tržište.")}
          {flag("Automatski motori", "autoEngines", "OMNI gol motor, ansambl konsenzus i sve super točnosti.")}
          {flag("Automatski Snajper v9", "autoSniper", "Svi filtri, uključujući nove: korelacija, prozori, kvaliteta protivnika.")}
          {flag("Automatska ANTI-GREŠKA", "autoAntiError", "Trostruka provjera, revizija brojki, zaštita od izmišljanja.")}
          {flag("Automatski Titan v10", "autoTitan", "Konačna presuda A/B/C/PRESKAČEM s intervalom pouzdanosti.")}
          {flag("Sigurnija linija umjesto preskakanja", "preferSaferLine", "Kad prag padne, nudi Over 1.5 / Under 3.5 / dvostruku šansu.")}
          {flag("Jedan konačan tip", "singleAnswer", "Bez lepeze varijanti — prva rečenica je tip i postotak.")}
          {flag("Revizijski blok", "showAudit", "Na kraju λ, raspon izvora, slaganje, edge i Kelly.")}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Tržišta na koja se primjenjuje</h3>
        <div className="flex flex-wrap gap-2">
          {markets.map(([m, label]) => (
            <label key={m} className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(p.markets[m])}
                onChange={(e) => upd({ ...p, markets: { ...p.markets, [m]: e.target.checked } })}
                className="h-3.5 w-3.5"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {knob("Maksimalno modela u lancu", "maxModels", 2, 16, 1, "Koliko neovisnih izvora Mastermind smije angažirati.")}
        {knob("Interni prolazi (self-consistency)", "passes", 1, 6, 1, "Više prolaza = stabilnija brojka.")}
        {knob("Minimalna sigurnost (%)", "minConfidence", 50, 95, 1, "Ispod toga nema glavnog tipa.")}
        {knob("Minimalno slaganje izvora (%)", "minAgreement", 50, 98, 1, "Koliko se modeli moraju slagati.")}
      </div>

      <button
        onClick={() => {
          activateEverything(p);
          toast.success("Sve najbolje postavke, motori i filtri su uključeni.");
        }}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        style={{ boxShadow: "var(--shadow-glow)" }}
      >
        <Sparkles className="h-4 w-4" /> Aktiviraj sve najbolje (super točnost + Snajper + ANTI-GREŠKA + Titan + OMNI)
      </button>
    </section>
  );
}

function OmniPanel() {
  const [p, setP] = useState<OmniPrefs>(DEFAULT_OMNI);
  useEffect(() => setP(loadOmni()), []);
  function upd(patch: Partial<OmniPrefs>) {
    const next = { ...p, ...patch };
    setP(next);
    saveOmni(next);
  }
  const brains = Object.keys(DEFAULT_OMNI.brains) as OmniBrain[];
  const flag = (label: string, key: keyof OmniPrefs, hint: string) => (
    <label key={String(key)} className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 p-2 text-xs">
      <input
        type="checkbox"
        checked={Boolean(p[key])}
        onChange={(e) => upd({ [key]: e.target.checked } as unknown as Partial<OmniPrefs>)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <strong className="block">{label}</strong>
        <span className="text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  const knob = (label: string, key: keyof OmniPrefs, min: number, max: number, step: number, hint: string) => (
    <label key={String(key)} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(p[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as unknown as Partial<OmniPrefs>)}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <section className="rounded-2xl border border-primary/60 bg-primary/5 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> OMNI GOL MOTOR — BTTS &amp; Over/Under 2.5
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              p.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {p.enabled ? "AKTIVAN" : "isključen"}
          </span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              upd({ enabled: !p.enabled });
              toast.success(!p.enabled ? "OMNI motor aktiviran." : "OMNI motor isključen.");
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            {p.enabled ? "Isključi" : "Aktiviraj"}
          </button>
          <button
            onClick={() => {
              setP({ ...DEFAULT_OMNI, enabled: p.enabled });
              saveOmni({ ...DEFAULT_OMNI, enabled: p.enabled });
              toast.success("Vraćeno na preporučeno.");
            }}
            className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
          >
            Vrati preporučeno
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Kad je aktiviran, svako pitanje o BTTS-u ili Over/Under 2.5 ide kroz SVE odabrane mozgove i njihove modele
        odjednom. Procjene se spajaju robusnom statistikom, pa se provjeravaju kopulom, game-state hazardom, Monte
        Carlom, de-vigom i Kellyjem. Chat bot dobiva taj izračun i mora ga poštovati.
      </p>

      <h3 className="text-sm font-semibold">Mozgovi u motoru</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {brains.map((b) => (
          <label key={b} className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 p-2 text-xs">
            <input
              type="checkbox"
              checked={p.brains[b]}
              onChange={(e) => upd({ brains: { ...p.brains, [b]: e.target.checked } })}
              className="h-4 w-4"
            />
            {OMNI_BRAIN_LABEL[b]}
          </label>
        ))}
      </div>

      <h3 className="text-sm font-semibold">Metode koje motor primjenjuje</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {flag("Frank kopula (korelirani golovi)", "useCopula", "BTTS bez pretpostavke neovisnosti golova.")}
        {flag("Game-state hazard λ(t)", "useHazard", "Over/Under 2.5 s rastućim intenzitetom prema kraju.")}
        {flag("Bayesov update λ", "useBayes", "Spaja procjene modela s prosjekom lige.")}
        {flag("Skellam kontrola", "useSkellam", "Neovisna provjera razlike golova i remija.")}
        {flag("Monte Carlo simulacija", "useMonteCarlo", "Nezavisna simulacijska kontrola vjerojatnosti.")}
        {flag("De-vig kvote", "useDevig", "Uklanja maržu (Shin/power/mult iz super postavki).")}
        {flag("Platt kalibracija", "usePlatt", "Ispravlja preuvjerene vjerojatnosti.")}
        {flag("Računaj oba tržišta odjednom", "bothMarkets", "Uvijek daj i GG i Over/Under (kombo tipovi).")}
      </div>

      <h3 className="text-sm font-semibold">Postavke motora</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {knob("Modela po mozgu", "modelsPerBrain", 1, 8, 1, "Više modela = točnije, ali sporije.")}
        {knob("Prolaza po modelu", "passes", 1, 3, 1, "Self-consistency: isti model pita se više puta.")}
        {knob("Odbacivanje outliera (pb)", "outlierPb", 4, 25, 1, "Procjene dalje od medijana se izbacuju.")}
        {knob("Težina tržišne kvote", "marketWeight", 0, 0.8, 0.05, "Koliko se model povlači prema de-vig kvoti.")}
        {knob("Regularizacija prema 50%", "shrink", 0, 0.4, 0.02, "Sprječava pretjerano sigurne tipove.")}
        {knob("Min. slaganje mozgova", "minAgreement", 0.2, 0.9, 0.05, "Ispod ovoga bot degradira tip.")}
        {knob("Min. sigurnost (%)", "minConfidence", 50, 75, 1, "Prag da tip prođe filtar vrijednosti.")}
        {knob("Min. edge (%)", "minEdge", 0, 15, 1, "Prag isplativosti u odnosu na kvotu.")}
        {knob("Frakcija Kellyja", "kellyFraction", 0.1, 1, 0.05, "Preporučeni udio banke.")}
        {knob("Monte Carlo iteracija", "mcIters", 5000, 60000, 5000, "Više = stabilnija kontrola.")}
      </div>
    </section>
  );
}

function AntiErrorPanel() {
  const [p, setP] = useState<AntiErrorPrefs>(DEFAULT_ANTIERROR);
  useEffect(() => setP(loadAntiError()), []);
  function upd(patch: Partial<AntiErrorPrefs>) {
    const next = { ...p, ...patch };
    setP(next);
    saveAntiError(next);
  }
  const check = (label: string, key: keyof AntiErrorPrefs) => (
    <label className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 p-2 text-xs">
      <input
        type="checkbox"
        checked={Boolean(p[key])}
        onChange={(e) => upd({ [key]: e.target.checked } as unknown as Partial<AntiErrorPrefs>)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
  const knob = (label: string, key: keyof AntiErrorPrefs, min: number, max: number, step: number, hint: string) => (
    <label className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(p[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ [key]: Number(e.target.value) } as unknown as Partial<AntiErrorPrefs>)}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" /> Napredne postavke · ANTI-GREŠKA zaštita
      </h2>
      <p className="text-sm text-muted-foreground">
        Ručni prekidač isključivo za BTTS (GG/NG) i Over/Under 2.5. Kad je uključena, protokol koriste svi mozgovi
        (OpenRouter, NVIDIA NIM, Hugging Face, Groq, Gemini) i svi motori (OMNI gol motor, ansambl konsenzus, super
        točnost): trostruka neovisna provjera, kontra-test protiv vlastitog tipa i prag objave — tip ide van samo ako
        prođe sve.
      </p>
      <label className="flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 p-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => {
            upd({ enabled: e.target.checked });
            toast.success(e.target.checked ? "ANTI-GREŠKA zaštita aktivirana." : "ANTI-GREŠKA zaštita isključena.");
          }}
          className="h-5 w-5"
        />
        Uključi ANTI-GREŠKA zaštitu
      </label>
      {p.enabled && (
        <p className="text-xs font-semibold text-primary">AKTIVNA — BTTS i OU 2.5 idu kroz zaštitu.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {check("Primijeni na BTTS (GG/NG)", "applyBtts")}
        {check("Primijeni na Over/Under 2.5", "applyOu25")}
        {check("Ako pragovi padnu → sigurnija linija", "saferLine")}
        {check("Prisili sve motore (OMNI + ansambl)", "forceEngines")}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {knob("Min. sigurnost (%)", "minConfidence", 60, 99, 1, "Ispod ovoga nema objave tipa.")}
        {knob("Min. slaganje mozgova (%)", "minAgreement", 60, 99, 1, "Slaganje metoda i modela.")}
        {knob("Prolaza po modelu", "passes", 1, 5, 1, "Interne provjere prije objave.")}
      </div>
    </section>
  );
}

function SniperPanel() {
  const [p, setP] = useState<SniperPrefs>(DEFAULT_SNIPER);
  useEffect(() => setP(loadSniper()), []);
  function upd(next: SniperPrefs) {
    setP(next);
    saveSniper(next);
  }
  const knob = (label: string, key: keyof SniperPrefs, min: number, max: number, step: number, hint: string) => (
    <label key={String(key)} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(p[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ ...p, [key]: Number(e.target.value) })}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
  const count = sniperActiveCount(p);
  const setAll = (v: boolean) => {
    const on = { ...p.on };
    (Object.keys(on) as SniperId[]).forEach((k) => (on[k] = v));
    upd({ ...p, on });
  };
  return (
    <section className="rounded-2xl border border-primary/60 bg-primary/5 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Snajper motor v9 — BTTS i Over/Under (ručna aktivacija)
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
            {count} aktivnih
          </span>
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setAll(true)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            Uključi sve
          </button>
          <button onClick={() => setAll(false)} className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted">
            Isključi sve
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Ovi filtri postoje zato što BTTS i Over/Under 2.5 najčešće padnu na utakmicama koje su zapravo 50/50. Kad ih
        uključiš, Luna radije preskoči utakmicu ili spusti liniju nego da ti da tip koji ne prolazi kontrolu. Sve je po
        defaultu isključeno — aktiviraj ručno ono što želiš.
      </p>
      <div className="space-y-3">
        {SNIPER_FILTERS.map((f) => (
          <div key={f.id} className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={p.on[f.id]}
                onChange={(e) => upd({ ...p, on: { ...p.on, [f.id]: e.target.checked } })}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {f.title}
                  {p.on[f.id] && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">AKTIVNO</span>
                  )}
                </span>
                <span className="block text-xs text-primary">{f.claim}</span>
                <span className="block text-xs text-muted-foreground">{f.desc}</span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2 pl-6">
              {f.markets.map((m) => (
                <label key={m} className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={Boolean(p.scope[f.id]?.[m])}
                    onChange={(e) =>
                      upd({ ...p, scope: { ...p.scope, [f.id]: { ...p.scope[f.id], [m]: e.target.checked } } })
                    }
                    className="h-3.5 w-3.5"
                  />
                  {SNIPER_MARKET_LABEL[m]}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-semibold">Pragovi i korektori</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {knob("Snajper — minimalna vjerojatnost", "minProb", 0.5, 0.95, 0.01, "Ispod ovoga Luna ne daje tip.")}
        {knob("Snajper — minimalni edge (%)", "minEdge", 0, 20, 1, "p × kvota − 1 mora biti iznad ovoga.")}
        {knob("Čuvar tržišta — dopušteno odstupanje (pb)", "guardMaxDevPb", 2, 20, 1, "Veće odstupanje = alarm i manja sigurnost.")}
        {knob("Čuvar tržišta — težina tržišta", "guardMarketWeight", 0, 0.9, 0.05, "0.45 = pola model, pola poštena kvota.")}
        {knob("Ljestvica linija — prag linije", "ladderThreshold", 0.5, 0.9, 0.01, "Bira najvišu liniju iznad ovog praga.")}
        {knob("Kapija podataka — max sigurnost bez podataka (%)", "dataGateCap", 40, 85, 1, "Kad fali xG/forma/kvota.")}
        {knob("Lomilac serija — jačina regresije", "streakPull", 0, 0.6, 0.05, "Koliko se serija povlači prema prosjeku.")}
        {knob("Kontekst — vrijeme/teren ×λ", "ctxWeather", 0.8, 1.1, 0.01, "Kiša, vjetar, loš teren spuštaju golove.")}
        {knob("Kontekst — sudac ×λ", "ctxReferee", 0.9, 1.2, 0.01, "Sudac sklon penalima diže golove.")}
        {knob("Kontekst — ulog utakmice ×λ", "ctxStakes", 0.85, 1.15, 0.01, "Derbi i opstanak spuštaju, bez uloga diže.")}
        {knob("Disciplina — max tipova dnevno", "maxTipsPerDay", 1, 20, 1, "Manje tipova, veća prosječna točnost.")}
        {knob("Disciplina — Kelly frakcija", "kellyFraction", 0.05, 1, 0.05, "0.25 = četvrtinski Kelly.")}
      </div>
    </section>
  );
}

function TitanPanel() {
  const [p, setP] = useState<TitanPrefs>(DEFAULT_TITAN);
  useEffect(() => setP(loadTitan()), []);
  function upd(next: TitanPrefs) {
    setP(next);
    saveTitan(next);
  }
  const knob = (label: string, key: keyof TitanPrefs, min: number, max: number, step: number, hint: string) => (
    <label key={String(key)} className="block text-xs">
      <span className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{String(p[key])}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => upd({ ...p, [key]: Number(e.target.value) })}
        className="mt-1 w-full accent-primary"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
  const count = titanActiveCount(p);
  const setAll = (v: boolean) => {
    const on = { ...p.on };
    (Object.keys(on) as TitanId[]).forEach((k) => (on[k] = v));
    upd({ ...p, on });
  };
  return (
    <section className="rounded-2xl border border-primary/60 bg-primary/5 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" /> Titan protokol v10 — završna kontrola točnosti (ručna aktivacija)
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
            {count} aktivnih
          </span>
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setAll(true)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            Uključi sve
          </button>
          <button onClick={() => setAll(false)} className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted">
            Isključi sve
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Titan je zadnja instanca iznad svega ostaloga: uzima rezultate super točnosti, OMNI motora, ansambla, Snajpera v9
        i ANTI-GREŠKE, spaja ih u jednu brojku i donosi konačnu presudu. Vrijedi za sva tržišta, uvijek vrijedi stroža
        granica, sve je po defaultu isključeno.
      </p>
      <div className="space-y-3">
        {TITAN_MODULES.map((f) => (
          <div key={f.id} className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={p.on[f.id]}
                onChange={(e) => upd({ ...p, on: { ...p.on, [f.id]: e.target.checked } })}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {f.title}
                  {p.on[f.id] && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">AKTIVNO</span>
                  )}
                </span>
                <span className="block text-xs text-primary">{f.claim}</span>
                <span className="block text-xs text-muted-foreground">{f.desc}</span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2 pl-6">
              {f.markets.map((m) => (
                <label key={m} className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={Boolean(p.scope[f.id]?.[m])}
                    onChange={(e) =>
                      upd({ ...p, scope: { ...p.scope, [f.id]: { ...p.scope[f.id], [m]: e.target.checked } } })
                    }
                    className="h-3.5 w-3.5"
                  />
                  {SNIPER_MARKET_LABEL[m]}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-semibold">Pragovi Titana</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {knob("Konsenzus — odbaci ekstreme (%)", "trimPct", 0, 40, 5, "Trimmed mean: koliko % s obje strane pada.")}
        {knob("Konsenzus — minimalno neovisnih izvora", "minSources", 1, 8, 1, "Ispod toga sigurnost je ograničena.")}
        {knob("Koherencija — dopušteno odstupanje (pb)", "coherenceTolPb", 1, 15, 1, "Razlika između izvedenih linija.")}
        {knob("Varijanca — razina intervala (%)", "ciLevel", 80, 99, 1, "Širina intervala pouzdanosti.")}
        {knob("Varijanca — donja granica mora biti ≥", "ciFloor", 0.4, 0.85, 0.01, "Inače nema tipa ili se spušta linija.")}
        {knob("CLV — kazna kad kvota ide protiv (pb)", "clvPenaltyPb", 0, 20, 1, "Pametni novac protiv tipa.")}
        {knob("Crveni tim — rez po neodgovorenom riziku (pb)", "redTeamCutPb", 0, 25, 1, "Za svaki argument bez odgovora.")}
        {knob("Presuda — prag ocjene A", "gradeA", 0.6, 0.95, 0.01, "Iznad ovoga tip se objavljuje.")}
        {knob("Presuda — prag ocjene B", "gradeB", 0.5, 0.9, 0.01, "Iznad ovoga tip ide sa smanjenim ulogom.")}
        {knob("Presuda — Kelly frakcija", "kellyFraction", 0.05, 1, 0.05, "0.25 = četvrtinski Kelly.")}
      </div>
    </section>
  );
}
