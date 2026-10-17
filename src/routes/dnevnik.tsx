/* ============================================================
   DNEVNIK — rezultatski dnevnik točnosti (korak 3)
   Sprema izdane tipove (BTTS Ultra, 2.5 Pro, HT/FT Beta) i po
   završetku utakmice uspoređuje stvarni ishod. Hit rate i
   Brier score po kartici — objektivno mjerilo da li motor
   pretjeruje ili je stvarno točan.
   ============================================================ */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { brisiDnevnik, dnevnikUnosi, statistika, type DnevnikUnos } from "@/lib/dnevnik";
import { getRezultat } from "@/lib/dnevnik.functions";
import { pogodakLi } from "@/lib/dnevnik";
import { saveJSON } from "@/lib/storage";
import { getApiKey } from "@/lib/zlatni-guard";

export const Route = createFileRoute("/dnevnik")({
  head: () => ({
    meta: [{ title: "Dnevnik · Točnost tipova · Precision Check" }],
  }),
  component: DnevnikPage,
});

const KEY = "pc.dnevnik.v1";

function fmtPct(x: number) { return `${(x * 100).toFixed(1)}%`; }
function brierOcjena(b: number) {
  if (b <= 0.15) return "odličan";
  if (b <= 0.20) return "vrlo dobar";
  if (b <= 0.25) return "uravnotežen s novčićem";
  return "pretjeruje — smanji povjerenje";
}

function DnevnikPage() {
  const [unosi, setUnosi] = useState<DnevnikUnos[]>([]);
  const [provjeram, setProvjeram] = useState(false);
  const [status, setStatus] = useState("");
  const [settings, setSettings] = useState(false);

  const osvjezi = useCallback(() => setUnosi(dnevnikUnosi()), []);

  useEffect(() => { osvjezi(); }, [osvjezi]);

  const provjeri = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) { setStatus("Prvo unesi API-Football ključ u Postavkama (⚙️)."); setSettings(true); return; }
    const sviCekajuci = dnevnikUnosi().filter((u) => u.status === "cekaj");
    const cekajuci = sviCekajuci.slice(0, 15); // najviše 15 po posjeti — API red ostaje u granicama
    const ostalo = sviCekajuci.length - cekajuci.length;
    if (!cekajuci.length) { setStatus("Svi tipovi su već provjereni."); return; }
    setProvjeram(true);
    setStatus(`Provjeravam ${cekajuci.length} tipova kroz API red…`);
    let pogodci = 0, promasaji = 0, josCekaju = 0;
    for (const u of cekajuci) {
      try {
        const r = await getRezultat({ data: { id: u.fixtureId, apiKey } });
        if (r.error || !r.gotova) { josCekaju++; continue; }
        const svi = dnevnikUnosi();
        const idx = svi.findIndex((x) => x.id === u.id);
        if (idx < 0) continue;
        const hit = pogodakLi(r.gh, r.ga, r.hth, r.hta, u.provjera);
        svi[idx].status = hit == null ? "cekaj" : hit ? "pogodak" : "promasaj";
        svi[idx].rezultat = r.rezultat;
        if (hit != null) { hit ? pogodci++ : promasaji++; }
        saveJSON(KEY, svi);
      } catch { josCekaju++; }
    }
    osvjezi();
    setStatus(`Gotovo: ${pogodci} pogođeno, ${promasaji} promašeno${josCekaju ? `, ${josCekaju} još čeka rezultat` : ""}${ostalo > 0 ? `. Još ${ostalo} tipova čeka sljedeću provjeru.` : ""}`);
    setProvjeram(false);
  }, [osvjezi]);

  // automatska provjera pri otvaranju (jednom)
  useEffect(() => { provjeri(); /* eslint-disable-next-line */ }, []);

  const stat = statistika();
  const ukupnoP = stat.reduce((s, x) => s + x.pogodci, 0);
  const ukupnoN = stat.reduce((s, x) => s + x.promasaji, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <BookOpen className="h-5 w-5 text-emerald-400" /> Dnevnik točnosti
          </h1>
          <p className="text-xs text-muted-foreground">
            Svaki izdani tip se provjeri po završetku utakmice — hit rate i Brier score po kartici.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={provjeri}
            disabled={provjeram}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {provjeram ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Provjeri rezultate
          </button>
          <button
            onClick={() => { brisiDnevnik(); osvjezi(); setStatus("Dnevnik izbrisan."); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
          >
            <Trash2 className="h-4 w-4" /> Očisti
          </button>
        </div>
      </div>

      {status && (
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">{status}</div>
      )}

      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Ukupno tipova</div>
          <div className="text-2xl font-bold tabular-nums">{unosi.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Pogođeno</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-400">{ukupnoP}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Promašeno</div>
          <div className="text-2xl font-bold tabular-nums text-red-400">{ukupnoN}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Hit rate</div>
          <div className="text-2xl font-bold tabular-nums">{ukupnoP + ukupnoN > 0 ? fmtPct(ukupnoP / (ukupnoP + ukupnoN)) : "—"}</div>
        </div>
      </div>

      {stat.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Kartica</th>
                <th className="px-3 py-2 text-right">Tipova</th>
                <th className="px-3 py-2 text-right">Hit rate</th>
                <th className="px-3 py-2 text-right">Brier</th>
                <th className="px-3 py-2 text-right">Čekaju</th>
              </tr>
            </thead>
            <tbody>
              {stat.map((s) => (
                <tr key={s.kartica} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{s.kartica}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.broj}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{s.pogodci + s.promasaji > 0 ? fmtPct(s.hitRate) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {s.pogodci + s.promasaji > 0 ? s.brier.toFixed(3) : "—"}
                    {s.pogodci + s.promasaji > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">({brierOcjena(s.brier)})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">{s.cekaju}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1.5">
        {unosi.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Dnevnik je prazan. Analiziraj utakmicu na BTTS Ultra, 2.5 Pro ili HT/FT Beta — svaki izdani tip automatski se zapiše ovdje.
          </div>
        ) : (
          [...unosi].reverse().map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{u.utakmica}</div>
                <div className="text-[10px] text-muted-foreground">
                  {u.kartica}{u.liga ? ` · ${u.liga}` : ""} · {new Date(u.ts).toLocaleDateString("hr-HR")}
                  {u.rezultat ? ` · rezultat ${u.rezultat}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-bold">{u.tip}</div>
                  <div className="text-[10px] text-muted-foreground">model {fmtPct(u.p)}{u.kvota != null ? ` @ ${u.kvota.toFixed(2)}` : ""}</div>
                </div>
                {u.status === "pogodak" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                {u.status === "promasaj" && <XCircle className="h-4 w-4 shrink-0 text-red-400" />}
                {(!u.status || u.status === "cekaj") && <RefreshCw className="h-4 w-4 shrink-0 text-slate-500" />}
              </div>
            </div>
          ))
        )}
      </div>

      {settings && <SettingsModal open={settings} onClose={() => setSettings(false)} />}
    </div>
  );
}
