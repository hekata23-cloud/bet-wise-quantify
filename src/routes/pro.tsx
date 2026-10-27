import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  pinnacleCompare, oddsMovement, xgLambdas, marketsFromLambdas,
  loadPicks, savePicks, calibrationStats, calibrate, type TrackedPick,
} from "@/lib/pro-sloj";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { analyze, type Analysis } from "@/lib/zlatni-engine";
import { getApiKey, guarded, pruneCache, readState, resetGuard, zagrebDay, RESERVE } from "@/lib/zlatni-guard";
import { SettingsModal } from "@/components/SettingsModal";
import { geminiChat } from "@/lib/gemini";
import { openrouterChat } from "@/lib/openrouter";
import { groqChat } from "@/lib/groq";
import { hasKey } from "@/lib/storage";
import { generateSportPrediction } from "@/lib/sport-intelligence";
import { Target, Bot, Zap, Calculator, Sparkles, Send, ShieldCheck, RefreshCw, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: "Pro Sharp Hub · Andromeda AI" },
      { name: "description", content: "Automatski skener vrijednosti, Sharp Oracle AI analitičar i profesionalni kladioničarski alati." },
      { property: "og:title", content: "Pro Sharp Hub · Andromeda AI" },
      { property: "og:description", content: "Pinnacle de-vig, steam kvota, xG model i pametni Sharp AI bot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProSharpHubPage,
});

const n = (s: string) => parseFloat(s.replace(",", "."));
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const LBL = ["1", "X", "2"];
const time = (t: string) => new Date(t).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" });

export function ProSharpHubPage() {
  const [tab, setTab] = useState<"skener" | "oracle" | "rucno">("skener");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Skener stanje
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<ZtFixture | null>(null);
  const [res, setRes] = useState<Analysis | null>(null);
  const [credits, setCredits] = useState("");

  // Sharp Oracle (Orion) stanje
  const [oracleInput, setOracleInput] = useState("");
  const [oracleMsgs, setOracleMsgs] = useState<Array<{ role: "user" | "oracle"; text: string }>>([
    {
      role: "oracle",
      text: "Pozdrav! Ja sam **Orion (Sharp Oracle)** — tvoj profesionalni kvantni model za nogomet, košarku i rukomet.\n\nNe postavljam suvišna pitanja. Za svaku utakmicu dajem konkretan tip, točan hendikep/zbroj, sigurnost %, fer kvotu, minimalnu isplativu kvotu (Value) i sigurnosnu liniju. Unesi par ili ga odaberi iz Skenera!",
    },
  ]);
  const [oracleBusy, setOracleBusy] = useState(false);

  // Ručni alati stanje
  const [pin, setPin] = useState(["", "", ""]);
  const [soft, setSoft] = useState(["", "", ""]);
  const [open, setOpen] = useState(["", "", ""]);
  const [now, setNow] = useState(["", "", ""]);
  const [xg, setXg] = useState({ hf: "1.6", ha: "1.1", af: "1.2", aa: "1.4", lg: "1.35" });
  const [picks, setPicks] = useState<TrackedPick[]>(() => (typeof window === "undefined" ? [] : loadPicks()));
  const [label, setLabel] = useState("");
  const [prob, setProb] = useState("");

  const refreshCredits = () => {
    const s = readState();
    setCredits(
      s.dayRemaining >= 0
        ? `Preostalo: ${s.dayRemaining}${s.dayLimit > 0 ? "/" + s.dayLimit : ""} · potrošeno: ${s.used} · rezerva ${RESERVE}`
        : `Potrošeno danas: ${s.used}`
    );
  };

  useEffect(() => {
    pruneCache();
    refreshCredits();
    if (getApiKey()) {
      loadFixtures(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFixtures = async (force = false) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }
    setBusy(true);
    try {
      const r = await guarded(
        "fixtures",
        1,
        () => getZtFixtures({ data: { date: zagrebDay(), apiKey } }),
        (ms, why) => setMsg(`${why} — čekam ${Math.ceil(ms / 1000)} s…`),
        force
      );
      if (r.error) {
        setMsg(`Greška: ${r.error === "RATE_LIMIT" ? "API limit — zaštita je uključila hlađenje." : r.error}`);
        return;
      }
      setFixtures(r.fixtures);
      setMsg(`${r.fixtures.length} utakmica spremno (iz memorije / 1 kredit).`);
    } catch (e: any) {
      setMsg(`🛡️ ${e.message}`);
    } finally {
      setBusy(false);
      refreshCredits();
    }
  };

  const pickFixture = async (f: ZtFixture) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }
    setSel(f);
    setRes(null);
    setBusy(true);
    setMsg(`Učitavam bet365 kvote i model za: ${f.home} — ${f.away}…`);
    try {
      const r = await guarded(
        `lite.${f.id}`,
        1,
        () => getZtMatch({ data: { id: f.id, apiKey, lite: true } }),
        (ms, why) => setMsg(`🛡️ ${why} — čekam ${Math.ceil(ms / 1000)} s…`)
      );
      if (r.error === "RATE_LIMIT" || r.error?.startsWith("ACCOUNT")) {
        setMsg(r.error === "RATE_LIMIT" ? "🛡️ API traži kratku pauzu (10 poziva/min). Pričekaj 15 s i klikni ponovno." : `🛡️ ${r.error}`);
        return;
      }
      const a = analyze(r.markets, r.home, r.away);
      setRes(a);
      setMsg(r.bookmaker ? `✅ ${Object.keys(r.markets).length} tržišta (${r.bookmaker}) učitano i modelirano — 1 kredit.` : "⚠️ Kvote još nisu objavljene za ovu utakmicu.");
    } catch (e: any) {
      setMsg(`🛡️ ${e.message}`);
    } finally {
      setBusy(false);
      refreshCredits();
    }
  };

  const sendToOracle = (f: ZtFixture, a: Analysis | null) => {
    let context = `${f.home} vs ${f.away} (${f.league})`;
    if (a) {
      context += `\nOčekivani golovi: ${a.lh.toFixed(2)} : ${a.la.toFixed(2)}\nZlatni tip: ${a.golden?.market} - ${a.golden?.outcome.label} (kvota: ${a.golden?.outcome.odd ?? "?"}, vjerojatnost: ${(a.golden?.outcome.p ? a.golden.outcome.p * 100 : 0).toFixed(1)}%)\nNajsigurnije: ${a.safe?.market} - ${a.safe?.outcome.label}\nValue opcija: ${a.value?.market} - ${a.value?.outcome.label}`;
    }
    setTab("oracle");
    triggerOraclePrompt(`Analiziraj utakmicu: ${f.home} protiv ${f.away}`, context);
  };

  const triggerOraclePrompt = async (prompt: string, context?: string) => {
    if (!prompt.trim() || oracleBusy) return;
    setOracleMsgs((prev) => [...prev, { role: "user", text: prompt }]);
    setOracleInput("");
    setOracleBusy(true);

    const systemPrompt = `Ti si ORION (SHARP ORACLE) — profesionalni kvantni analitičar sportskog klađenja i kvotni modeler.
Pokrivaš sve lige i sva tržišta za: NOGOMET, KOŠARKU i RUKOMET.
Tvoj cilj je izravna matematička prednost (Value Betting, de-vig marža i Kelly ulog).

STROGA PRAVILA ODGOVORA:
1. NIKADA ne postavljaj korisniku dodatna pitanja.
2. Odmah daj jasan, strukturiran i profesionalan odgovor ovisno o sportu:
   - 🎯 GLAVNI TIP: Konkretan ishod s procijenjenom vjerojatnosti u % i FER KVOTOM (=100/p).
   - 💰 VALUE LINIJA: Minimalna isplativa kvota na tržištu (>2% prednosti) i isplati li se igrati po trenutnim linijama.
   - 🛡️ SIGURNOSNA LINIJA: Ako je glavni tip rizičan (<60%), daj sigurniju alternativu (npr. DNB, Over 1.5, hendikep + spread).
   - 🔢 TOČAN REZULTAT: Najvjerojatniji točan rezultat i očekivani raspon poena/golova.
   - ⚖️ PREPORUČENI ULOG: Frakcijski Kelly ulog (1% do 3% banke).
3. Za KOŠARKU obavezno uključi hendikep poena (spread) i granicu ukupno koševa.
4. Za RUKOMET obavezno uključi hendikep golova, dvostruku šansu 1X/X2 (remi je ~9-10%) i zbroj golova.
5. Za NOGOMET uključi GG/NG, Over/Under 2.5 i 1X2.
6. Piši isključivo na hrvatskom jeziku, precizno, sažeto i stručno.
${context ? `\nPODACI O ODABRANOJ UTAKMICI:\n${context}` : ""}`;

    try {
      let reply = "";
      if (hasKey("gemini")) {
        reply = await geminiChat(systemPrompt, [{ role: "user", parts: [{ text: prompt }] }]);
      } else if (hasKey("groq")) {
        reply = await groqChat([
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ]);
      } else if (hasKey("openrouter")) {
        reply = await openrouterChat("meta-llama/llama-3.3-70b-instruct:free", [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ]);
      }

      if (!reply || !reply.trim()) {
        const generated = generateSportPrediction(prompt, undefined, "orion");
        reply = generated.formattedText;
      }

      setOracleMsgs((prev) => [...prev, { role: "oracle", text: reply }]);
    } catch {
      // 🛡️ Nema praznog odgovora niti rušenja
      const generated = generateSportPrediction(prompt, undefined, "orion");
      setOracleMsgs((prev) => [...prev, { role: "oracle", text: generated.formattedText }]);
    } finally {
      setOracleBusy(false);
    }
  };

  // Kalkulatori
  const cmp = pinnacleCompare(pin.map(n), soft.map(n));
  const mv = oddsMovement(open.map(n), now.map(n));
  const { lh, la } = xgLambdas({
    homeXgFor: n(xg.hf),
    homeXgAg: n(xg.ha),
    awayXgFor: n(xg.af),
    awayXgAg: n(xg.aa),
    leagueAvg: n(xg.lg),
  });
  const mk = Number.isFinite(lh + la) ? marketsFromLambdas(lh, la) : null;
  const st = calibrationStats(picks);
  const upd = (p: TrackedPick[]) => {
    setPicks(p);
    savePicks(p);
  };

  const shown = fixtures.filter((f) =>
    `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-2 md:p-4">
      {/* Glavni Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Pro Sharp Hub</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">Pro v2.0</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Automatski skener vrijednosti, profesionalni AI bot bez dosadnih pitanja i napredni oštri alati.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
          >
            ⚙️ Postavke & Ključevi
          </button>
          <button
            onClick={() => {
              resetGuard();
              refreshCredits();
              setMsg("Zaštita resetirana.");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Poništi blokadu
          </button>
        </div>
      </div>

      {/* Info status bara */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Status API-Football: {credits || "Provjera..."}</span>
        </div>
        {msg && <span className="font-medium text-primary">{msg}</span>}
      </div>

      {/* Tab navigacija */}
      <div className="flex rounded-xl border border-border bg-muted/40 p-1">
        <button
          onClick={() => setTab("skener")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            tab === "skener" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="h-4 w-4 text-amber-500" /> Automatski Sharp Skener
        </button>
        <button
          onClick={() => setTab("oracle")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            tab === "oracle" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="h-4 w-4 text-primary" /> Sharp Oracle AI Bot
        </button>
        <button
          onClick={() => setTab("rucno")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            tab === "rucno" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calculator className="h-4 w-4 text-emerald-500" /> Ručni Alati & Edukacija
        </button>
      </div>

      {/* TAB 1: AUTOMATSKI SHARP SKENER */}
      {tab === "skener" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">Automatski Sharp Skener Utakmica</h2>
                <p className="text-xs text-muted-foreground">
                  Jednim klikom učitaj utakmice dana. Klikom na utakmicu automatski se povlače stvarne bet365 kvote i Dixon-Coles model.
                </p>
              </div>
              <button
                disabled={busy}
                onClick={() => loadFixtures(fixtures.length > 0)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5" />
                {fixtures.length ? "Osvježi utakmice" : "Učitaj utakmice dana"}
              </button>
            </div>

            {fixtures.length > 0 && (
              <>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="🔍 Filtriraj po klubu ili ligi (npr. Arsenal, Real, Premier League)..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
                <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {shown.map((f) => (
                    <button
                      key={f.id}
                      disabled={busy}
                      onClick={() => pickFixture(f)}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition-colors hover:bg-secondary ${
                        sel?.id === f.id ? "bg-secondary font-semibold" : ""
                      }`}
                    >
                      <span>
                        <b className="text-foreground">{f.home} — {f.away}</b>
                        <span className="block text-muted-foreground">{f.league}</span>
                      </span>
                      <span className="font-mono text-primary font-semibold">
                        {f.status === "NS" ? time(f.time) : f.status}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Rezultat odabrane utakmice */}
          {sel && res && (
            <div className="rounded-2xl border-2 border-primary/80 bg-card p-5 space-y-4 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">Sharp Analiza</span>
                  <h3 className="text-xl font-black text-foreground">{sel.home} — {sel.away}</h3>
                  <p className="text-xs text-muted-foreground">{sel.league}</p>
                </div>
                <button
                  onClick={() => sendToOracle(sel, res)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20"
                >
                  <Bot className="h-4 w-4" /> Pitaj Sharp Oracle o ovom paru
                </button>
              </div>

              {/* Istaknuti Value i Glavni Tip */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <span className="text-[11px] font-bold uppercase text-primary">🎯 Glavni Sharp Tip</span>
                  {res.golden ? (
                    <>
                      <div className="text-lg font-black text-foreground">{res.golden.market}: {res.golden.outcome.label}</div>
                      <div className="text-xs text-muted-foreground">
                        Kvota: <b className="text-foreground">{res.golden.outcome.odd?.toFixed(2) ?? "—"}</b> · Fer kvota: <b>{res.golden.outcome.fair.toFixed(2)}</b>
                      </div>
                      <div className="text-xs font-semibold text-emerald-500">
                        Vjerojatnost: {pct(res.golden.outcome.p)}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">Nema dovoljno bet365 kvota.</div>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                  <span className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">💰 Najveća Vrijednost (Value Bet)</span>
                  {res.value ? (
                    <>
                      <div className="text-lg font-black text-foreground">{res.value.market}: {res.value.outcome.label}</div>
                      <div className="text-xs text-muted-foreground">
                        Kvota: <b className="text-foreground">{res.value.outcome.odd?.toFixed(2) ?? "—"}</b>
                      </div>
                      <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        EV: +{((res.value.outcome.ev ?? 0) * 100).toFixed(1)}% matematičke prednosti!
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">Kvote su trenutno u balansu.</div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-secondary/50 p-3 space-y-1">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground">🛡️ Najsigurnija Linija</span>
                  {res.safe ? (
                    <>
                      <div className="text-lg font-black text-foreground">{res.safe.market}: {res.safe.outcome.label}</div>
                      <div className="text-xs text-muted-foreground">
                        Kvota: <b className="text-foreground">{res.safe.outcome.odd?.toFixed(2) ?? "—"}</b>
                      </div>
                      <div className="text-xs font-semibold text-primary">
                        Sigurnost: {pct(res.safe.outcome.p)}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">—</div>
                  )}
                </div>
              </div>

              {/* Očekivani golovi i točni rezultati */}
              <div className="grid gap-2 sm:grid-cols-2 rounded-xl bg-muted/40 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Očekivani golovi (xG model):</span>
                  <p className="text-sm font-bold text-foreground">
                    {sel.home} ({res.lh.toFixed(2)}) : ({res.la.toFixed(2)}) {sel.away}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Najvjerojatniji točni rezultati:</span>
                  <p className="text-sm font-bold text-foreground">
                    {res.topScores.slice(0, 3).map((s) => `${s.score} (${pct(s.p)})`).join(" · ")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SHARP ORACLE AI BOT */}
      {tab === "oracle" && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="font-bold text-base">⚡ Orion (Sharp Oracle) — Analitički AI Mozak</h2>
                <p className="text-xs text-muted-foreground">
                  Fokusiran na matematičku vrijednost (+EV), fer kvote, hendikep i konkretne tipove za nogomet, košarku i rukomet.
                </p>
              </div>
            </div>
            <button
              onClick={() => setOracleMsgs([{
                role: "oracle",
                text: "Razgovor resetiran. Za koji par želiš brzu analizu i proračun fer kvota?",
              }])}
              className="rounded-lg border border-input bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Očisti chat
            </button>
          </div>

          {/* Poruke */}
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {oracleMsgs.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 text-sm max-w-[85%] leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-muted/80 text-foreground border border-border whitespace-pre-line"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {oracleBusy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                <Sparkles className="h-3.5 w-3.5 animate-spin text-primary" /> Sharp Oracle računa modele i fer kvote…
              </div>
            )}
          </div>

          {/* Brzi prijedlozi */}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {[
              "Analiziraj današnji derbi kola",
              "Pronađi najbolji Over 2.5 ili GG tip",
              "Daj mi najsigurniji dvoznak (1X ili X2) danas",
              "Koji je najveći matematički value danas?",
            ].map((s) => (
              <button
                key={s}
                disabled={oracleBusy}
                onClick={() => triggerOraclePrompt(s)}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Unos */}
          <div className="flex gap-2 pt-2">
            <input
              value={oracleInput}
              disabled={oracleBusy}
              onChange={(e) => setOracleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  triggerOraclePrompt(oracleInput);
                }
              }}
              placeholder="Upiši utakmicu ili pitanje (npr. Real Madrid - Barcelona tip i fer kvota)..."
              className="flex-1 rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              disabled={oracleBusy || !oracleInput.trim()}
              onClick={() => triggerOraclePrompt(oracleInput)}
              className="flex items-center justify-center rounded-xl bg-primary px-4 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: RUČNI ALATI & EDUKACIJA */}
      {tab === "rucno" && (
        <div className="space-y-6">
          {/* Uvod i gdje naći kvote */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
              <HelpCircle className="h-5 w-5" /> Gdje besplatno pronaći Pinnacle kvote i padove?
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Za ručni unos kvota koristi besplatni servis <b>Oddsportal.com</b>. Tamo imaš pregled svih svjetskih kladionica (Pinnacle, bet365, bwin) i strelice pada kvota. Upiši Pinnacleove kvote kao "oštru liniju", a kvote tvoje lokalne kladionice (SuperSport, PSK, Favbet) kao "meku liniju".
            </p>
          </div>

          {/* 1. Pinnacle Usporedba */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <h3 className="font-bold text-base">1. Usporedba s Pinnacleom (Traženje vrijednosti - Value Bet)</h3>
              <p className="text-xs text-muted-foreground">
                Pinnacle ima najmanju maržu na svijetu. Uklanjanjem njihove provizije dobivamo 100% poštenu "fer cijenu". Ako tvoja kladionica nudi veću kvotu, u prednosti si nad kladionicom!
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-1">Pinnacle kvote (1, X, 2):</span>
              <div className="grid grid-cols-3 gap-2">
                {pin.map((x, i) => (
                  <input
                    key={i}
                    inputMode="decimal"
                    placeholder={`Pinnacle ${LBL[i]}`}
                    value={x}
                    onChange={(e) => {
                      const c = [...pin];
                      c[i] = e.target.value;
                      setPin(c);
                    }}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-1">Tvoja lokalna kladionica (1, X, 2):</span>
              <div className="grid grid-cols-3 gap-2">
                {soft.map((x, i) => (
                  <input
                    key={i}
                    inputMode="decimal"
                    placeholder={`Lokalna ${LBL[i]}`}
                    value={x}
                    onChange={(e) => {
                      const c = [...soft];
                      c[i] = e.target.value;
                      setSoft(c);
                    }}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                ))}
              </div>
            </div>
            {cmp.length > 0 && (
              <div className="rounded-xl bg-muted/40 p-3 space-y-2 text-xs">
                {cmp.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>
                      <b>Ishod {LBL[i]}:</b> fer vjerojatnost {pct(r.fairProb)} · poštena kvota {r.fairOdds.toFixed(2)}
                    </span>
                    <span className={r.value ? "text-emerald-500 font-bold" : "text-muted-foreground"}>
                      {r.edgePct >= 0 ? "+" : ""}{r.edgePct.toFixed(1)}% {r.value ? "🔥 VALUE BET" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Pad Kvota */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <h3 className="font-bold text-base">2. Pad Kvota (Steam / Pametni Novac)</h3>
              <p className="text-xs text-muted-foreground">
                Prati kretanje kvota od otvaranja ponude do danas. Pad veći od 5% obično označava ulazak velikih novčanih sindikata na taj ishod.
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-1">Početne kvote pri otvaranju (1, X, 2):</span>
              <div className="grid grid-cols-3 gap-2">
                {open.map((x, i) => (
                  <input
                    key={i}
                    inputMode="decimal"
                    placeholder={`Otvaranje ${LBL[i]}`}
                    value={x}
                    onChange={(e) => {
                      const c = [...open];
                      c[i] = e.target.value;
                      setOpen(c);
                    }}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block mb-1">Trenutne kvote sada (1, X, 2):</span>
              <div className="grid grid-cols-3 gap-2">
                {now.map((x, i) => (
                  <input
                    key={i}
                    inputMode="decimal"
                    placeholder={`Sada ${LBL[i]}`}
                    value={x}
                    onChange={(e) => {
                      const c = [...now];
                      c[i] = e.target.value;
                      setNow(c);
                    }}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                ))}
              </div>
            </div>
            {mv.length > 0 && (
              <div className="rounded-xl bg-muted/40 p-3 space-y-2 text-xs">
                {mv.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>
                      <b>Ishod {LBL[i]}:</b> {pct(r.openProb)} → {pct(r.nowProb)}
                    </span>
                    <span
                      className={
                        r.signal === "steam"
                          ? "text-emerald-500 font-bold"
                          : r.signal === "drift"
                          ? "text-red-500 font-semibold"
                          : "text-muted-foreground"
                      }
                    >
                      {r.shiftPts >= 0 ? "+" : ""}{r.shiftPts.toFixed(1)} bod. ·{" "}
                      {r.signal === "steam" ? "⚡ STEAM (Ulazak novca)" : r.signal === "drift" ? "🔻 DRIFT (Odljev novca)" : "Mirno"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. xG Model */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-bold text-base">3. xG Model Jačine (Maher Poisson)</h3>
            <p className="text-xs text-muted-foreground">
              Izračunaj očekivani broj golova obje momčadi na temelju prosječnog xG učinka i prosjeka lige.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {([
                ["hf", "Domaćin xG za"],
                ["ha", "Domaćin xG protiv"],
                ["af", "Gost xG za"],
                ["aa", "Gost xG protiv"],
                ["lg", "Prosjek lige po momčadi"],
              ] as const).map(([k, l]) => (
                <label key={k} className="space-y-1 block">
                  <span className="text-muted-foreground">{l}</span>
                  <input
                    inputMode="decimal"
                    value={xg[k]}
                    onChange={(e) => setXg({ ...xg, [k]: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>
            {mk && (
              <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1">
                <div>λ domaćin: <b>{lh.toFixed(2)}</b> · λ gost: <b>{la.toFixed(2)}</b></div>
                <div className="font-semibold text-foreground">
                  1: {pct(mk.home)} · X: {pct(mk.draw)} · 2: {pct(mk.away)}
                </div>
                <div>Over 2.5: <b>{pct(mk.over25)}</b> · Oba daju gol (GG): <b>{pct(mk.btts)}</b></div>
              </div>
            )}
          </div>

          {/* 4. Kalibracija */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-bold text-base">4. Ocjena Kalibracije & Brier Score</h3>
            <p className="text-xs text-muted-foreground">
              Unesi svoje ili AI tipove s postotkom sigurnosti i nakon utakmice označi je li prošao. Sustav automatski računa tvoju točnost.
            </p>
            <div className="flex gap-2">
              <input
                placeholder="Naziv para i tip (npr. Dinamo - Hajduk 1X)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
              />
              <input
                placeholder="%"
                inputMode="decimal"
                value={prob}
                onChange={(e) => setProb(e.target.value)}
                className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              />
              <button
                onClick={() => {
                  const p = n(prob) / 100;
                  if (!label || !(p > 0 && p < 1)) return;
                  upd([{ id: crypto.randomUUID(), label, prob: p, won: null, ts: Date.now() }, ...picks]);
                  setLabel("");
                  setProb("");
                }}
                className="rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground"
              >
                Dodaj
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              {st.n ? (
                <>
                  Ukupno ocijenjeno: <b>{st.n}</b> · Uspješnost: <b>{pct(st.hitRate!)}</b> · Prosječno predviđeno:{" "}
                  <b>{pct(st.avgProb!)}</b> · Brier skor: <b>{st.brier!.toFixed(3)}</b>
                </>
              ) : (
                "Nema ocijenjenih tipova. Dodaj tip gore i zabilježi ishod."
              )}
            </div>

            <div className="divide-y divide-border rounded-lg border border-border max-h-48 overflow-y-auto">
              {picks.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 text-xs">
                  <span>{p.label} · <b className="text-primary">{pct(p.prob)}</b></span>
                  <div className="flex items-center gap-1">
                    {([true, false] as const).map((w) => (
                      <button
                        key={String(w)}
                        onClick={() => upd(picks.map((x) => (x.id === p.id ? { ...x, won: w } : x)))}
                        className={`rounded px-2 py-0.5 border border-border text-[11px] ${
                          p.won === w ? (w ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "hover:bg-muted"
                        }`}
                      >
                        {w ? "Prošao" : "Pao"}
                      </button>
                    ))}
                    <button onClick={() => upd(picks.filter((x) => x.id !== p.id))} className="px-1.5 text-muted-foreground hover:text-foreground">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal s postavkama za API ključeve */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

