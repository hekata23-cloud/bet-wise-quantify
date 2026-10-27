import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { snapshoti } from "@/lib/odds-tracker";
import { citajPracene, padoviKvota, sharpConsensus, PAD_PRAG_PCT, type PadKvote, type PracenaUtakmica } from "@/lib/smart-money";
import { fit1x2 } from "@/lib/obrnute-kvote";
import { skellam } from "@/lib/skellam-dnb";
import { useLigaFilter } from "@/lib/league-tier";
import { useUtakmiceDana, poredajZaSken } from "@/hooks/use-utakmice-dana";
import { LeagueTierFilter } from "@/components/LeagueTierFilter";
import { SettingsModal } from "@/components/SettingsModal";

export const Route = createFileRoute("/smart-money")({
  head: () => ({
    meta: [
      { title: "Radar pametnog novca · Dropping Odds · Andromeda AI Beta" },
      { name: "description", content: "Kvote koje padnu ≥8% unutar 12 sati — STEAM signal, provjeren SARP modelom." },
      { property: "og:title", content: "Radar pametnog novca · Andromeda AI Beta" },
      { property: "og:description", content: "Gdje profesionalci ulažu: nagli padovi kvota i SHARP CONSENSUS provjera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

/** Rani signal: manji pad koji se još razvija (prikazuje se odvojeno od STEAM-a). */
const RANI_PRAG_PCT = 3;
const MAX_SNIMANJE = 15;
const MAX_POKUSAJA = 30;

type Red = { u: PracenaUtakmica; pad: PadKvote; pModel: number | null; slaze: boolean; ev: number; steam: boolean };
type Pracena = { u: PracenaUtakmica; snimaka: number; kvote: Record<string, number> };

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
  const [pracene, setPracene] = useState<Pracena[]>([]);
  const [settings, setSettings] = useState(false);

  const skeniraj = () => {
    const out: Red[] = [];
    const sve: Pracena[] = [];
    const sad = Date.now();
    for (const u of citajPracene()) {
      const s = snapshoti(u.id);
      if (!s.length) continue;
      const zadnje = s[s.length - 1]?.kvote ?? {};
      // Utakmice koje su odavno počele više nisu zanimljive radaru.
      if (new Date(u.time).getTime() > sad - 2 * 3600_000) sve.push({ u, snimaka: s.length, kvote: zadnje });
      for (const pad of padoviKvota(s, sad, RANI_PRAG_PCT)) {
        const p = pModela(zadnje, pad.kljuc);
        const c = p != null ? sharpConsensus(p, pad.otvaranje, pad.sada) : { slaze: false, ev: 0 };
        out.push({ u, pad, pModel: p, ...c, steam: pad.padPct >= PAD_PRAG_PCT });
      }
    }
    setRedovi(out.sort((a, b) => b.pad.padPct - a.pad.padPct));
    setPracene(sve.sort((a, b) => a.u.time.localeCompare(b.u.time)));
  };
  useEffect(skeniraj, []);

  const osvjezi = async () => {
    setBusy(true);
    let snimljeno = 0, pokusaja = 0;
    try {
      const bucket = Math.floor(Date.now() / (2 * 3600_000));
      // Prije: prvih 15 po vremenu (često lige bez kvota) → ništa se nije snimilo.
      // Sada: prvo top lige, utakmice bez kvota se preskaču.
      for (const f of poredajZaSken(fx.filter((x) => prolazi(x.league)))) {
        if (snimljeno >= MAX_SNIMANJE || pokusaja >= MAX_POKUSAJA) break;
        pokusaja++;
        setMsg(`Snimam kvote: ${f.home} — ${f.away}… (${snimljeno}/${MAX_SNIMANJE})`);
        if (await kvote(f, `sm.${f.id}.${bucket}`)) snimljeno++;
      }
      setMsg(`Snimljeno ${snimljeno} utakmica s kvotama (${pokusaja - snimljeno} bez kvota preskočeno). Padovi se vide nakon idućeg snimka (za 2 h ili više).`);
      skeniraj();
    } catch (e: any) { setMsg(e?.message ?? "Greška"); } finally { setBusy(false); }
  };

  const vidljivi = redovi.filter((r) => prolazi(r.u.league));
  const steam = vidljivi.filter((r) => r.steam);
  const rani = vidljivi.filter((r) => !r.steam);
  const vidljivePracene = pracene.filter((p) => prolazi(p.u.league));
  const vrijeme = (t: string) => new Date(t).toLocaleTimeString("hr-HR", { timeZone: "Europe/Zagreb", hour: "2-digit", minute: "2-digit" });

  const kartica = (r: Red) => (
    <div key={`${r.u.id}.${r.pad.kljuc}`} className={`rounded-xl border p-4 ${r.slaze && r.steam ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{r.u.home} — {r.u.away}</div>
          <div className="text-xs text-muted-foreground">{r.u.league} · {vrijeme(r.u.time)}</div>
        </div>
        {r.steam
          ? <span className="rounded-md bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">STEAM / SHARP DROP −{r.pad.padPct}%</span>
          : <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold">RANI SIGNAL −{r.pad.padPct}%</span>}
      </div>
      <div className="mt-2 text-sm tabular-nums">
        <b>{r.pad.kljuc}</b>: {r.pad.otvaranje.toFixed(2)} → {r.pad.sada.toFixed(2)} {r.pad.minuta > 0 && <span className="text-muted-foreground">(za {Math.round(r.pad.minuta / 60 * 10) / 10} h)</span>}
        {r.pModel != null && <span className="text-muted-foreground"> · model {(r.pModel * 100).toFixed(1)}% · EV {(r.ev * 100).toFixed(1)}%</span>}
      </div>
      {r.slaze && r.steam && <div className="mt-1 text-xs font-bold text-primary">✓ SHARP CONSENSUS VERIFIED (High EV)</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">📉 Radar pametnog novca · Dropping Odds</h1>
        <p className="text-sm text-muted-foreground">Kvota pala ≥{PAD_PRAG_PCT}% u zadnjih 12 h = signal da veliki novac ulazi na taj ishod. Padovi od {RANI_PRAG_PCT}% prikazuju se kao rani signal.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <LeagueTierFilter />
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={async () => { if (!(await ucitajDan())) setSettings(true); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Učitaj utakmice dana</button>
          {fx.length > 0 && <button disabled={busy} onClick={osvjezi} className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Snimi kvote (do {MAX_SNIMANJE})</button>}
          <button onClick={skeniraj} className="rounded-lg border border-border px-3 py-2 text-sm">Ponovno skeniraj</button>
          <button onClick={() => setSettings(true)} className="rounded-lg border border-border px-3 py-2 text-sm">Postavke (API ključ)</button>
        </div>
        <p className="text-xs text-muted-foreground">Radar koristi i kvote koje su ostale kartice već učitale. Što češće snimaš, to radar bolje vidi kretanje.</p>
        {msg && <p className="text-sm">{msg}</p>}
      </div>

      {steam.length > 0 && <div className="space-y-2"><h2 className="text-sm font-semibold">STEAM padovi (≥{PAD_PRAG_PCT}%)</h2>{steam.map(kartica)}</div>}
      {rani.length > 0 && <div className="space-y-2"><h2 className="text-sm font-semibold">Rani signali ({RANI_PRAG_PCT}–{PAD_PRAG_PCT}%)</h2>{rani.map(kartica)}</div>}
      {vidljivi.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {vidljivePracene.length
            ? `Pratim ${vidljivePracene.length} utakmica — još nema padova ≥${RANI_PRAG_PCT}%. Snimi kvote ponovno za 2+ sata.`
            : "Još nema praćenih utakmica. Klikni „Učitaj utakmice dana”, pa „Snimi kvote”."}
        </p>
      )}

      {vidljivePracene.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Praćene utakmice ({vidljivePracene.length})</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {vidljivePracene.map((p) => (
              <div key={p.u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{vrijeme(p.u.time)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.u.home} — {p.u.away}</span>
                <span className="tabular-nums text-xs">1 {p.kvote["1"]?.toFixed(2) ?? "-"} · X {p.kvote["X"]?.toFixed(2) ?? "-"} · 2 {p.kvote["2"]?.toFixed(2) ?? "-"}</span>
                <span className="text-xs text-muted-foreground">{p.snimaka} {p.snimaka === 1 ? "snimak" : "snimka"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <SettingsModal open={settings} onClose={() => setSettings(false)} onSaved={() => setSettings(false)} />
    </div>
  );
}
