import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  pinnacleCompare, oddsMovement, xgLambdas, marketsFromLambdas,
  loadPicks, savePicks, calibrationStats, calibrate, type TrackedPick,
} from "@/lib/pro-sloj";

export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: "Pro Sharp alati · Andromeda AI" },
      { name: "description", content: "Pinnacle usporedba, pad kvota, xG model jačine i kalibracija tipova — metode profesionalnih kladionica." },
      { property: "og:title", content: "Pro Sharp alati · Andromeda AI" },
      { property: "og:description", content: "Pinnacle de-vig, steam kvota, xG model i kalibracija tipova." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProPage,
});

const n = (s: string) => parseFloat(s.replace(",", "."));
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const LBL = ["1", "X", "2"];

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Triple({ v, set, ph }: { v: string[]; set: (x: string[]) => void; ph: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {v.map((x, i) => (
        <input key={i} inputMode="decimal" placeholder={`${ph} ${LBL[i]}`} value={x}
          onChange={(e) => { const c = [...v]; c[i] = e.target.value; set(c); }}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
      ))}
    </div>
  );
}

function ProPage() {
  const [pin, setPin] = useState(["", "", ""]);
  const [soft, setSoft] = useState(["", "", ""]);
  const [open, setOpen] = useState(["", "", ""]);
  const [now, setNow] = useState(["", "", ""]);
  const [xg, setXg] = useState({ hf: "1.6", ha: "1.1", af: "1.2", aa: "1.4", lg: "1.35" });
  const [picks, setPicks] = useState<TrackedPick[]>(() => (typeof window === "undefined" ? [] : loadPicks()));
  const [label, setLabel] = useState(""); const [prob, setProb] = useState("");

  const cmp = pinnacleCompare(pin.map(n), soft.map(n));
  const mv = oddsMovement(open.map(n), now.map(n));
  const { lh, la } = xgLambdas({ homeXgFor: n(xg.hf), homeXgAg: n(xg.ha), awayXgFor: n(xg.af), awayXgAg: n(xg.aa), leagueAvg: n(xg.lg) });
  const mk = Number.isFinite(lh + la) ? marketsFromLambdas(lh, la) : null;
  const st = calibrationStats(picks);
  const upd = (p: TrackedPick[]) => { setPicks(p); savePicks(p); };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Pro Sharp alati</h1>
      <p className="text-sm text-muted-foreground">Metode koje koriste trgovci kladionica. AI chat automatski primjenjuje istu metodologiju i tvoju kalibraciju.</p>

      <Box title="1. Usporedba s Pinnacleom">
        <Triple v={pin} set={setPin} ph="Pinnacle" />
        <Triple v={soft} set={setSoft} ph="Tvoja kladionica" />
        {cmp.map((r, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{LBL[i]}: fer {pct(r.fairProb)} · fer kvota {r.fairOdds.toFixed(2)}</span>
            <span className={r.value ? "text-primary font-semibold" : "text-muted-foreground"}>
              {r.edgePct >= 0 ? "+" : ""}{r.edgePct.toFixed(1)}% {r.value ? "VALUE" : ""}
            </span>
          </div>
        ))}
      </Box>

      <Box title="2. Pad kvota (pametni novac)">
        <Triple v={open} set={setOpen} ph="Otvaranje" />
        <Triple v={now} set={setNow} ph="Sada" />
        {mv.map((r, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{LBL[i]}: {pct(r.openProb)} → {pct(r.nowProb)}</span>
            <span className={r.signal === "steam" ? "text-primary font-semibold" : "text-muted-foreground"}>
              {r.shiftPts >= 0 ? "+" : ""}{r.shiftPts.toFixed(1)} bod. · {r.signal === "steam" ? "STEAM" : r.signal === "drift" ? "bijeg novca" : "mirno"}
            </span>
          </div>
        ))}
      </Box>

      <Box title="3. xG model jačine">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {([["hf", "Domaćin xG za"], ["ha", "Domaćin xG protiv"], ["af", "Gost xG za"], ["aa", "Gost xG protiv"], ["lg", "Prosjek golova lige po momčadi"]] as const).map(([k, l]) => (
            <label key={k} className="space-y-1"><span className="text-muted-foreground">{l}</span>
              <input inputMode="decimal" value={xg[k]} onChange={(e) => setXg({ ...xg, [k]: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5" /></label>
          ))}
        </div>
        {mk && (
          <div className="text-sm space-y-1">
            <div>λ domaćin {lh.toFixed(2)} · λ gost {la.toFixed(2)}</div>
            <div>1 {pct(mk.home)} · X {pct(mk.draw)} · 2 {pct(mk.away)}</div>
            <div>Over 2.5 {pct(mk.over25)} · GG {pct(mk.btts)}</div>
            {st.n >= 5 && <div className="text-muted-foreground">Kalibrirano: 1 {pct(calibrate(mk.home, st.shrink))} · Over 2.5 {pct(calibrate(mk.over25, st.shrink))}</div>}
          </div>
        )}
      </Box>

      <Box title="4. Ocjena kalibracije">
        <div className="flex gap-2">
          <input placeholder="Tip (npr. Dinamo – Hajduk Over 2.5)" value={label} onChange={(e) => setLabel(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          <input placeholder="%" inputMode="decimal" value={prob} onChange={(e) => setProb(e.target.value)}
            className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          <button className="rounded-md bg-primary px-3 text-sm text-primary-foreground"
            onClick={() => { const p = n(prob) / 100; if (!label || !(p > 0 && p < 1)) return;
              upd([{ id: crypto.randomUUID(), label, prob: p, won: null, ts: Date.now() }, ...picks]); setLabel(""); setProb(""); }}>Dodaj</button>
        </div>
        <div className="text-sm">
          {st.n ? <>Ocijenjeno {st.n} · pogodak {pct(st.hitRate!)} · predviđeno {pct(st.avgProb!)} · Brier {st.brier!.toFixed(3)} · faktor {st.shrink.toFixed(2)}</>
            : "Dodaj tipove i označi ishod — chat će prema tome ispravljati svoje postotke."}
        </div>
        {picks.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm border-t border-border pt-2">
            <span>{p.label} · {pct(p.prob)}</span>
            <span className="flex gap-1">
              {([true, false] as const).map((w) => (
                <button key={String(w)} onClick={() => upd(picks.map((x) => x.id === p.id ? { ...x, won: w } : x))}
                  className={`rounded px-2 border border-border ${p.won === w ? "bg-primary text-primary-foreground" : ""}`}>{w ? "Prošao" : "Pao"}</button>
              ))}
              <button onClick={() => upd(picks.filter((x) => x.id !== p.id))} className="px-2 text-muted-foreground">✕</button>
            </span>
          </div>
        ))}
      </Box>
    </div>
  );
}
