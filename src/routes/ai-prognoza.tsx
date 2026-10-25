import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture, type Bet365Markets } from "@/lib/zlatni-tip.functions";
import { analyze, type Analysis } from "@/lib/zlatni-engine";
import { getApiKey, guarded, pruneCache, resetGuard, zagrebDay } from "@/lib/zlatni-guard";
import { getAiPrognoza, type AiPrognoza } from "@/lib/ai-prognoza.functions";
import { runAiPrognozaFallback } from "@/lib/ai-prognoza-fallback";
import { Brain, RefreshCw, Sparkles, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/ai-prognoza")({
  head: () => ({
    meta: [
      { title: "AI Prognoza · Andromeda AI" },
      { name: "description", content: "Unesi utakmicu, vrstu oklade i kvote — model i AI daju usklađenu prognozu s vjerojatnošću." },
      { property: "og:title", content: "AI Prognoza · Andromeda AI" },
      { property: "og:description", content: "Usklađena prognoza: de-vig, Dixon-Coles model i AI analitičar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiPrognozaPage,
});

const VRSTE = ["Najbolji tip (bilo koji)", "Konačan ishod 1X2", "Dvostruka šansa", "Ukupno golova", "Oba tima zabijaju (GG)", "Poluvrijeme / kraj", "Točan rezultat", "Golovi tima"];
const num = (s: string) => { const v = parseFloat(s.replace(",", ".")); return Number.isFinite(v) && v > 1 ? v : undefined; };

// Lovable AI krediti se pamte kao potrošeni do kraja posjete (refresh) — kartica
// tada ODMAH ide na besplatni rezervni mozak umjesto da čeka ponovnu grešku.
const LOVABLE_402 = "ai.lovable.402";
const lovablePotrosen = () => { try { return sessionStorage.getItem(LOVABLE_402) === "1"; } catch { return false; } };
const zapamtiLovable402 = () => { try { sessionStorage.setItem(LOVABLE_402, "1"); } catch { /* ignore */ } };

function buildContext(a: Analysis, bookmaker: string | null) {
  const rows = a.markets.slice(0, 40).map((m) =>
    `${m.name}: ` + m.outcomes.map((o) => `${o.label} ${(o.p * 100).toFixed(1)}%${o.odd ? ` @${o.odd}` : ""}`).join(" | "),
  );
  return [
    `Kvote: ${bookmaker ?? "ručni unos"}`,
    `Očekivani golovi (λ): ${a.lh.toFixed(2)} : ${a.la.toFixed(2)}`,
    `Najvjerojatniji rezultati: ${a.topScores.slice(0, 5).map((s) => `${s.score} ${(s.p * 100).toFixed(1)}%`).join(", ")}`,
    ...rows,
  ].join("\n");
}

function AiPrognozaPage() {
  const [mode, setMode] = useState<"auto" | "rucno">("auto");
  const [fixtures, setFixtures] = useState<ZtFixture[]>([]);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState("");
  const [vrsta, setVrsta] = useState(VRSTE[0]!);
  const [an, setAn] = useState<Analysis | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [ai, setAi] = useState<AiPrognoza | null>(null);
  const [k, setK] = useState({ h: "", d: "", a: "", o25: "", u25: "", gg: "", ng: "", o15: "", u15: "" });

  useEffect(() => { pruneCache(); }, []);

  const loadFixtures = async (force = false) => {
    const apiKey = getApiKey();
    if (!apiKey) { setMsg("Upiši API-Football ključ u Postavkama ili koristi ručni unos."); return; }
    setBusy(true);
    try {
      const r = await guarded("fixtures", 1, () => getZtFixtures({ data: { date: zagrebDay(), apiKey } }), (ms, w) => setMsg(`${w} — ${Math.ceil(ms / 1000)} s…`), force);
      if (r.error) setMsg(r.error === "RATE_LIMIT" ? "API traži kratku pauzu — pokušaj za 15 s." : r.error);
      else { setFixtures(r.fixtures); setMsg(`${r.fixtures.length} utakmica danas.`); }
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  const pick = async (f: ZtFixture) => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    setMatch(`${f.home} - ${f.away} (${f.league})`);
    setAi(null); setAn(null); setBusy(true); setMsg("Učitavam kvote (1 kredit)…");
    try {
      const r = await guarded(`lite.${f.id}`, 1, () => getZtMatch({ data: { id: f.id, apiKey, lite: true } }), (ms, w) => setMsg(`${w} — ${Math.ceil(ms / 1000)} s…`));
      if (r.error === "RATE_LIMIT" || r.error?.startsWith("ACCOUNT")) { setMsg(r.error === "RATE_LIMIT" ? "API traži kratku pauzu — pokušaj za 15 s." : r.error); return; }
      if (!Object.keys(r.markets).length) { setMsg("Kvote još nisu objavljene — prebaci na ručni unos."); return; }
      setAn(analyze(r.markets, null, null)); setBook(r.bookmaker);
      setMsg(`✅ ${Object.keys(r.markets).length} tržišta (${r.bookmaker}). Klikni "AI prognoza".`);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  const manualAnalyze = () => {
    const mk: Bet365Markets = {};
    const put = (name: string, o: Record<string, number | undefined>) => {
      const c = Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Record<string, number>;
      if (Object.keys(c).length >= 2) mk[name] = c;
    };
    put("Match Winner", { Home: num(k.h), Draw: num(k.d), Away: num(k.a) });
    put("Goals Over/Under", { "Over 2.5": num(k.o25), "Under 2.5": num(k.u25), "Over 1.5": num(k.o15), "Under 1.5": num(k.u15) });
    put("Both Teams Score", { Yes: num(k.gg), No: num(k.ng) });
    if (!mk["Match Winner"] && !mk["Goals Over/Under"]) { setMsg("Unesi barem kvote 1X2 ili Više/Manje 2.5."); return null; }
    const a = analyze(mk, null, null);
    setAn(a); setBook("ručni unos"); setAi(null);
    return a;
  };

  const runAi = async () => {
    if (!match.trim()) { setMsg("Upiši utakmicu."); return; }
    const a = mode === "rucno" ? manualAnalyze() : an;
    if (!a) { if (mode === "auto") setMsg("Najprije odaberi utakmicu."); return; }
    setBusy(true); setMsg("AI analitičar radi…");
    const ctx = buildContext(a, book);
    const inp = { utakmica: match, vrstaOklade: vrsta, kontekst: ctx };

    const rezervni = async (glavnaGreska: string) => {
      setMsg("Lovable AI nedostupan — besplatni mozgovi rade paralelno…");
      const fb = await runAiPrognozaFallback(inp, (m) => setMsg(m));
      if (fb.ok) {
        setAi(fb.p);
        setMsg("✅ Prognoza s besplatnog rezervnog mozga (OpenRouter :free) — Lovable krediti nisu potrošeni.");
      } else setMsg(`${glavnaGreska} — ${fb.error}`);
    };

    try {
      // Ako smo već znali da su mjesečni krediti potrošeni, ne čekamo Lovable AI:
      // odmah paralelni besplatni mozgovi.
      if (lovablePotrosen()) {
        await rezervni("Mjesečni besplatni AI krediti su potrošeni (pamti se do refresha stranice).");
        return;
      }
      const r = await getAiPrognoza({ data: inp });
      if (r.ok) { setAi(r.p); setMsg(""); return; }
      const err = r.error || "";
      if (/potrošen|potrošeni|kredit/i.test(err)) zapamtiLovable402();
      await rezervni(err);
    } catch (e: any) {
      zapamtiLovable402();
      try { await rezervni(e.message); }
      catch (e2: any) { setMsg(`${e.message} — ${e2.message}`); }
    } finally { setBusy(false); }
  };

  const shown = fixtures.filter((f) => `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 80);
  const inp = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Brain className="h-6 w-6 text-primary" /> AI Prognoza</h1>
        <button onClick={() => { resetGuard(); setMsg("Hlađenje poništeno."); }} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs"><ShieldCheck className="h-4 w-4" /> Poništi hlađenje</button>
      </header>
      <p className="text-sm text-muted-foreground">Model izračuna fer vjerojatnosti iz kvota (bez marže), a AI iz njih daje jedan usklađen tip, sigurnosnu liniju i ulog.</p>

      <div className="flex gap-2">
        {(["auto", "rucno"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? "bg-primary text-primary-foreground" : "border border-border"}`}>
            {m === "auto" ? "Automatski (API-Football)" : "Ručni unos kvota"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <label className="text-sm">Utakmica<input className={inp} value={match} onChange={(e) => setMatch(e.target.value)} placeholder="npr. Dinamo - Hajduk" /></label>
        <label className="text-sm">Vrsta oklade
          <select className={inp} value={vrsta} onChange={(e) => setVrsta(e.target.value)}>{VRSTE.map((v) => <option key={v}>{v}</option>)}</select>
        </label>
      </div>

      {mode === "auto" ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => loadFixtures(fixtures.length > 0)} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Učitaj utakmice dana</button>
            <input className={inp} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Traži tim ili ligu…" />
          </div>
          <div className="max-h-72 overflow-auto divide-y divide-border">
            {shown.map((f) => (
              <button key={f.id} disabled={busy} onClick={() => pick(f)} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="font-medium">{f.home} – {f.away}</span> <span className="text-xs text-muted-foreground">{f.league}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-card p-4 text-sm md:grid-cols-9">
          {([["h", "1"], ["d", "X"], ["a", "2"], ["o15", "Više 1.5"], ["u15", "Manje 1.5"], ["o25", "Više 2.5"], ["u25", "Manje 2.5"], ["gg", "GG"], ["ng", "NG"]] as const).map(([key, l]) => (
            <label key={key}>{l}<input className={inp} inputMode="decimal" value={k[key]} onChange={(e) => setK({ ...k, [key]: e.target.value })} /></label>
          ))}
        </div>
      )}

      <button disabled={busy} onClick={runAi} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"><Sparkles className="h-4 w-4" /> AI prognoza</button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {ai && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">{ai.trziste}</div>
          <div className="text-2xl font-bold">🎯 {ai.glavniTip}</div>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div>Vjerojatnost: <b>{ai.vjerojatnost.toFixed(1)}%</b></div>
            <div>Fer kvota: <b>{ai.ferKvota.toFixed(2)}</b></div>
            <div>Kvota: <b>{ai.kvota ?? "—"}</b></div>
            <div>EV: <b className={ai.isplativo ? "text-primary" : ""}>{ai.evPostotak != null ? `${ai.evPostotak.toFixed(1)}%` : "—"}</b></div>
            <div>Sigurnosna linija: <b>{ai.sigurnosnaLinija}</b></div>
            <div>Točan rezultat: <b>{ai.tocanRezultat}</b></div>
            <div>Ulog: <b>{ai.ulogPostotak.toFixed(1)}% banke</b></div>
            <div>{ai.isplativo ? "✅ Isplativo" : "⚠️ Bez vrijednosti"}</div>
          </div>
          <p className="text-sm">{ai.obrazlozenje}</p>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">{ai.rizici.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      {an && (
        <details className="rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer">Izračun modela ({an.lh.toFixed(2)} : {an.la.toFixed(2)} golova)</summary>
          <div className="mt-2 space-y-1">
            {an.markets.slice(0, 20).map((m) => (
              <div key={m.name}><b>{m.name}:</b> {m.outcomes.map((o) => `${o.label} ${(o.p * 100).toFixed(1)}%`).join(" · ")}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
