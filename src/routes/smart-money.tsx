import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { snapshoti } from "@/lib/odds-tracker";
import { citajPracene, padoviKvota, sharpConsensus, type PadKvote, type PracenaUtakmica } from "@/lib/smart-money";
import { fit1x2 } from "@/lib/obrnute-kvote";
import { skellam } from "@/lib/skellam-dnb";
import { useLigaFilter } from "@/lib/league-tier";
import { useUtakmiceDana } from "@/hooks/use-utakmice-dana";
import { LeagueTierFilter } from "@/components/LeagueTierFilter";
import { SettingsModal } from "@/components/SettingsModal";

export const Route = createFileRoute("/smart-money")({
  head: () => ({
    meta: [
      { title: "Radar pametnog novca · Dropping Odds · Andromeda AI" },
      { name: "description", content: "Kvote koje padnu ≥8% unutar 12 sati — STEAM signal, provjeren SARP modelom." },
      { property: "og:title", content: "Radar pametnog novca · Andromeda AI" },
      { property: "og:description", content: "Gdje profesionalci ulažu: nagli padovi kvota i SHARP CONSENSUS provjera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Red = { u: PracenaUtakmica; pad: PadKvote; pModel: number | null; slaze: boolean; ev: number };

function pModela(kvote: Record<string, number>, kljuc: string): number | null {
  if (!kvote["1"] || !kvote["X"] || !kvote["2"]) return null;
  const { lh, la } = fit1x2(kvote["1"], kvote["X"], kvote["2"]);
  const sk = skellam(lh, la);
  const sum = (f: (d: number) => boolean) => [...sk].reduce((s, [d, p]) => (f(d) ? s + p : s), 0);
  const p1 = sum((d) => d > 0), px = sum((d) => d === 0), p2 = sum((d) => d < 0);
  const ph0 = Math.exp(-lh), pa0 = Math.exp(-la), l = lh + la;
  const under25 = Math.exp(-l) * (1 + l + (l * l) / 2);
  const map: Record<string, number> = {
    "1": p1, X: px, "2": p2, "Over 2.5": 1 - under25, "Under 2.5": under25,
    GG: (1 - ph0) * (1 - pa0), NG: 1 - (1 - ph0) * (1 - pa0),
    "DNB 1": p1 / (1 - px), "DNB 2": p2 / (1 - px),
  };
  return map[kljuc] ?? null;
}

function Page() {
  const { fx, msg, setMsg, busy, setBusy, ucitajDan, kvote } = useUtakmiceDana();
  const { prolazi } = useLigaFilter();
  const [redovi, setRedovi] = useState<Red[]>([]);
  const [settings, setSettings] = useState(false);

  const skeniraj = () => {
    const out: Red[] = [];
    for (const u of citajPracene()) {
      const s = snapshoti(u.id);
      const zadnje = s[s.length - 1]?.kvote ?? {};
      for (const pad of padoviKvota(s)) {
        const p = pModela(zadnje, pad.kljuc);
        const c = p != null ? sharpConsensus(p, pad.otvaranje, pad.sada) : { slaze: false, ev: 0 };
        out.push({ u, pad, pModel: p, ...c });
      }
    }
    setRedovi(out.sort((a, b) => b.pad.padPct - a.pad.padPct));
  };
  useEffect(skeniraj, []);

  const osvjezi = async () => {
    setBusy(true);
    try {
      const bucket = Math.floor(Date.now() / (2 * 3600_000));
      const lista = (fx.length ? fx : []).filter((f) => prolazi(f.league)).slice(0, 15);
      for (const f of lista) { setMsg(`Snimam kvote: ${f.home} — ${f.away}…`); await kvote(f, `sm.${f.id}.${bucket}`); }
      setMsg(`Snimljeno ${lista.length} utakmica. Padovi se vide nakon drugog snimka (najranije za 2 h).`);
      skeniraj();
    } catch (e: any) { setMsg(e?.message ?? "Greška"); } finally { setBusy(false); }
  };

  const vidljivi = redovi.filter((r) => prolazi(r.u.league));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">📉 Radar pametnog novca · Dropping Odds</h1>
        <p className="text-sm text-muted-foreground">Kvota pala ≥8% u zadnjih 12 h = signal da veliki novac ulazi na taj ishod.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <LeagueTierFilter />
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={async () => { if (!(await ucitajDan())) setSettings(true); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Učitaj utakmice dana</button>
          {fx.length > 0 && <button disabled={busy} onClick={osvjezi} className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Snimi kvote (do 15)</button>}
          <button onClick={skeniraj} className="rounded-lg border border-border px-3 py-2 text-sm">Ponovno skeniraj</button>
          <button onClick={() => setSettings(true)} className="rounded-lg border border-border px-3 py-2 text-sm">Postavke (API ključ)</button>
        </div>
        <p className="text-xs text-muted-foreground">Radar koristi i kvote koje su ostale kartice već učitale. Što češće snimaš, to radar bolje vidi kretanje.</p>
        {msg && <p className="text-sm">{msg}</p>}
      </div>

      {vidljivi.length === 0 && <p className="text-sm text-muted-foreground">Još nema padova ≥8%. Snimi kvote sada i ponovno za nekoliko sati.</p>}
      <div className="space-y-2">
        {vidljivi.map((r) => (
          <div key={`${r.u.id}.${r.pad.kljuc}`} className={`rounded-xl border p-4 ${r.slaze ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{r.u.home} — {r.u.away}</div>
                <div className="text-xs text-muted-foreground">{r.u.league}</div>
              </div>
              <span className="rounded-md bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">STEAM / SHARP DROP −{r.pad.padPct}%</span>
            </div>
            <div className="mt-2 text-sm tabular-nums">
              <b>{r.pad.kljuc}</b>: {r.pad.otvaranje.toFixed(2)} → {r.pad.sada.toFixed(2)} {r.pad.minuta > 0 && <span className="text-muted-foreground">(za {Math.round(r.pad.minuta / 60 * 10) / 10} h)</span>}
              {r.pModel != null && <span className="text-muted-foreground"> · model {(r.pModel * 100).toFixed(1)}% · EV {(r.ev * 100).toFixed(1)}%</span>}
            </div>
            {r.slaze && <div className="mt-1 text-xs font-bold text-primary">✓ SHARP CONSENSUS VERIFIED (High EV)</div>}
          </div>
        ))}
      </div>
      <SettingsModal open={settings} onClose={() => setSettings(false)} onSaved={() => setSettings(false)} />
    </div>
  );
}
