/* ============================================================
   TRACK RECORD — Verified Track Record & Accuracy Log (v1)
   Transparentnost: dnevni Win Rate, ROI i settled picks iz
   Dnevnika, s filterima po sportu i datumu. Gumb "Provjeri
   rezultate" provjerava neraščunane tipove kroz API red.
   ============================================================ */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle, Clock3, TrendingUp, Info } from "lucide-react";
import { dnevnikUnosi, pogodakLi, type DnevnikUnos } from "@/lib/dnevnik";
import {
  dnevnaStatistika, filtriraj, ukupnaStatistika, badgeZa, badgeLabel,
  type SportFilter,
} from "@/lib/track-record";
import { getRezultat } from "@/lib/dnevnik.functions";
import { saveJSON } from "@/lib/storage";
import { getApiKey } from "@/lib/zlatni-guard";

export const Route = createFileRoute("/track-record")({
  head: () => ({
    meta: [{ title: "Track Record · Verified · Precision Check" }],
  }),
  component: TrackRecordPage,
});

const KEY = "pc.dnevnik.v1";
const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const SPORTOVI: { k: SportFilter; label: string }[] = [
  { k: "sve", label: "Sve" },
  { k: "nogomet", label: "Nogomet" },
  { k: "kosarka", label: "Košarka" },
  { k: "rukomet", label: "Rukomet" },
];

function Badge({ s }: { s: "won" | "lost" | "void" }) {
  const cls =
    s === "won"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : s === "lost"
        ? "bg-red-500/20 text-red-300 border-red-500/40"
        : "bg-slate-500/20 text-slate-300 border-slate-500/40";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {s === "won" ? <CheckCircle2 className="h-3 w-3" /> : s === "lost" ? <XCircle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
      {badgeLabel(s)}
    </span>
  );
}

function TrackRecordPage() {
  const [sport, setSport] = useState<SportFilter>("sve");
  const [odDatum, setOdDatum] = useState("");
  const [doDatum, setDoDatum] = useState("");
  const [unosi, setUnosi] = useState<DnevnikUnos[]>([]);
  const [status, setStatus] = useState("");
  const [provjeram, setProvjeram] = useState(false);

  const osvjezi = useCallback(() => setUnosi(dnevnikUnosi()), []);
  useEffect(() => { osvjezi(); }, [osvjezi]);

  const filtrirano = filtriraj(unosi, { sport, odDatum: odDatum || undefined, doDatum: doDatum || undefined });
  const ukupno = ukupnaStatistika(filtrirano);
  const dani = dnevnaStatistika(filtrirano);

  async function provjeriRezultate() {
    const apiKey = getApiKey();
    if (!apiKey) { setStatus("Prvo unesi API-Sports ključ u Postavkama."); return; }
    const sad = Date.now();
    const cekajuci = dnevnikUnosi().filter(
      (u) =>
        u.status === "cekaj" &&
        sad - (u.zadnjaProvjera ?? 0) > 30 * 60_000 &&
        sad - new Date(u.datum).getTime() > 2 * 60 * 60_000,
    ).slice(0, 10);
    if (!cekajuci.length) { setStatus("Svi tipovi su provjereni ili još nisu spremni (utakmica traje < 2 h)."); return; }
    setProvjeram(true);
    setStatus(`Provjeravam ${cekajuci.length} tipova kroz API red…`);
    for (const u of cekajuci) {
      try {
        const r = await getRezultat({ data: { fixtureId: u.fixtureId, sport: u.sport, apiKey } });
        const svi = dnevnikUnosi();
        const i0 = svi.findIndex((x) => x.id === u.id);
        if (i0 >= 0) { svi[i0].zadnjaProvjera = Date.now(); saveJSON(KEY, svi); }
        if (r.error && /DNEVNI_LIMIT|ACCOUNT|RATE_LIMIT/.test(r.error)) { setStatus(`Osigurač: ${r.error}`); break; }
        if (r.error || !r.zavrsena || r.dom == null || r.gost == null) continue;
        if (u.provjera.vrsta === "htft" && (r.domHT == null || r.gostHT == null)) continue;
        const i = dnevnikUnosi().findIndex((x) => x.id === u.id);
        if (i < 0) continue;
        const hit = pogodakLi(u.provjera, r.dom, r.gost, r.domHT, r.gostHT, r.domReg, r.gostReg);
        const svi2 = dnevnikUnosi();
        svi2[i].status = hit ? "pogodak" : "promasaj";
        svi2[i].rezultat = `${r.dom} — ${r.gost}${r.domHT != null ? ` (${r.domHT} — ${r.gostHT})` : ""}`;
        saveJSON(KEY, svi2);
      } catch { /* preskoči */ }
    }
    setProvjeram(false);
    setStatus("Provjera završena — metrike su osvježene.");
    osvjezi();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
            <TrendingUp className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Track Record</h1>
            <p className="text-sm text-muted-foreground">
              Verified accuracy log — svaki izdani tip zapisan u Dnevniku i provjeren stvarnim rezultatom. Nema ručnog biranja pogodaka.
            </p>
          </div>
          <Link to="/info" className="ml-auto hidden items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-muted/40 sm:flex">
            <Info className="h-3.5 w-3.5" /> Info & Arhitektura
          </Link>
        </div>
      </div>

      {/* Ukupno */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="text-xs text-muted-foreground">Win Rate</div>
          <div className="text-2xl font-bold tabular-nums">{pct(ukupno.winRate)}</div>
          <div className="text-[11px] text-muted-foreground">{ukupno.pogodci}W / {ukupno.promasaji}L</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="text-xs text-muted-foreground">Total ROI</div>
          <div className={`text-2xl font-bold tabular-nums ${(ukupno.roi ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {ukupno.roi == null ? "—" : `${ukupno.roi >= 0 ? "+" : ""}${ukupno.roi.toFixed(1)}%`}
          </div>
          <div className="text-[11px] text-muted-foreground">{ukupno.profit >= 0 ? "+" : ""}{ukupno.profit.toFixed(2)} u (ulog 1/tip)</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="text-xs text-muted-foreground">Settled Picks</div>
          <div className="text-2xl font-bold tabular-nums">{ukupno.igrano}</div>
          <div className="text-[11px] text-muted-foreground">{ukupno.staked} plaćenih uloga</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="text-xs text-muted-foreground">Čekaju provjeru</div>
          <div className="text-2xl font-bold tabular-nums">{ukupno.cekaju}</div>
          <div className="text-[11px] text-muted-foreground">utakmice u tijeku</div>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-3">
        <span className="text-xs text-muted-foreground">Sport:</span>
        {SPORTOVI.map((s) => (
          <button
            key={s.k}
            onClick={() => setSport(s.k)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${sport === s.k ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "border border-border/60 hover:bg-muted/40"}`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">Datum:</span>
        <input type="date" value={odDatum} onChange={(e) => setOdDatum(e.target.value)} className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs" />
        <span className="text-xs text-muted-foreground">do</span>
        <input type="date" value={doDatum} onChange={(e) => setDoDatum(e.target.value)} className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs" />
        <button
          onClick={() => void provjeriRezultate()}
          disabled={provjeram}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${provjeram ? "animate-spin" : ""}`} /> Provjeri rezultate
        </button>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}

      {/* Dnevni pregled */}
      <div className="overflow-hidden rounded-xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-card/80 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Settled</th>
              <th className="px-3 py-2">W / L</th>
              <th className="px-3 py-2">Win Rate</th>
              <th className="px-3 py-2">ROI</th>
              <th className="px-3 py-2">Čekaju</th>
            </tr>
          </thead>
          <tbody>
            {dani.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">Nema tipova za odabrani filter.</td></tr>
            )}
            {dani.map((d) => (
              <tr key={d.datum} className="border-t border-border/40">
                <td className="px-3 py-2 font-mono text-xs">{d.datum}</td>
                <td className="px-3 py-2 tabular-nums">{d.igrano}</td>
                <td className="px-3 py-2 tabular-nums">
                  <span className="text-emerald-400">{d.pogodci}</span> / <span className="text-red-400">{d.promasaji}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{pct(d.winRate)}</td>
                <td className={`px-3 py-2 tabular-nums ${(d.roi ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {d.roi == null ? "—" : `${d.roi >= 0 ? "+" : ""}${d.roi.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{d.cekaju}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pojedinačni tipovi (filtrirano) */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground">Pojedinačni tipovi ({filtrirano.length})</div>
        {filtrirano.slice(0, 60).map((u) => (
          <div key={u.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-xs">
            <Badge s={badgeZa(u)} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{u.utakmica}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {u.kartica} · {u.tip} · p={Math.round(u.p * 100)}%{u.kvota != null ? ` · @${u.kvota.toFixed(2)}` : ""}
                {u.rezultat ? ` · rezultat ${u.rezultat}` : ""}
              </div>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{u.datum.slice(0, 10)}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        ROI se računa flat-staking (ulog 1 jedinica po tipu). Status &quot;ČEKA&quot; = utakmica još nije završena.
        Predikcije su probabilistički modeli u informativne svrhe — 18+, odgovorno igranje.
      </p>
    </div>
  );
}
