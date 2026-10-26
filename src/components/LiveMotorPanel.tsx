// ============================================================
// LIVE MOTOR PANEL — In-Play preračunavanje (svi tržišni izlazi)
// Korisnik unosi trenutnu minutu/rezultat (ili dohvati živi rezultat),
// motor uvjetovano preračunava O/U, BTTS, 1X2 i sljedeći gol.
// Opcionalno: unos uživo kvota → LIVE VALUE OPPORTUNITY alarm.
// ============================================================
import { useMemo, useState } from "react";
import { Loader2, Radio, RefreshCw, Zap } from "lucide-react";
import { afGet } from "@/lib/api-football";
import { liveAnaliza, liveEdge, LIVE_VALUE_PRAG } from "@/lib/live-motor";

interface LiveMotorPanelProps {
  fixtureId: number;
  dom: string;
  gost: string;
  lambdaDom: number;
  lambdaGost: number;
}

function P(x: number) {
  return `${(x * 100).toFixed(0)}%`;
}

function Bar({ label, p, jak }: { label: string; p: number; jak?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 flex-none text-[11px] text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
        <div
          className={`h-full rounded ${jak ? "bg-emerald-500/70" : "bg-cyan-500/60"}`}
          style={{ width: `${Math.min(100, p * 100)}%` }}
        />
      </div>
      <span
        className={`w-10 flex-none text-right text-[11px] tabular-nums ${jak ? "font-bold text-emerald-400" : "text-foreground"}`}
      >
        {P(p)}
      </span>
    </div>
  );
}

export function LiveMotorPanel({
  fixtureId,
  dom,
  gost,
  lambdaDom,
  lambdaGost,
}: LiveMotorPanelProps) {
  const [minuta, setMinuta] = useState(0);
  const [goloviDom, setGoloviDom] = useState(0);
  const [goloviGost, setGoloviGost] = useState(0);
  const [crveniDom, setCrveniDom] = useState(0);
  const [crveniGost, setCrveniGost] = useState(0);
  const [kvotaO25, setKvotaO25] = useState("");
  const [kvotaGG, setKvotaGG] = useState("");
  const [dohvacam, setDohvacam] = useState(false);
  const [dohvatPoruka, setDohvatPoruka] = useState("");

  const lambdaOk = lambdaDom > 0.05 && lambdaGost > 0.05;

  const live = useMemo(
    () =>
      liveAnaliza({
        lambdaDom,
        lambdaGost,
        minuta,
        goloviDom,
        goloviGost,
        crveniDom,
        crveniGost,
      }),
    [lambdaDom, lambdaGost, minuta, goloviDom, goloviGost, crveniDom, crveniGost],
  );

  const edgeO25 = liveEdge(live.o25, Number(kvotaO25.replace(",", ".")));
  const edgeGG = liveEdge(live.btts, Number(kvotaGG.replace(",", ".")));
  const najboljiEdge = Math.max(edgeO25, edgeGG);
  const liveValue = najboljiEdge >= LIVE_VALUE_PRAG;

  async function dohvatiLive() {
    setDohvacam(true);
    setDohvatPoruka("");
    try {
      const resp = await afGet<any>("fixtures", { id: fixtureId }, { ttlMs: 60 * 1000 });
      const f = resp?.response?.[0];
      if (!f) {
        setDohvatPoruka("Utakmica nije pronađena.");
        return;
      }
      const el = Number(f?.fixture?.status?.elapsed ?? 0);
      setMinuta(el);
      setGoloviDom(Number(f?.goals?.home ?? 0));
      setGoloviGost(Number(f?.goals?.away ?? 0));
      setDohvatPoruka(
        `Uživo: ${el}' ${f?.goals?.home ?? 0}:${f?.goals?.away ?? 0} (0 novih trošenja ako je keš svjež)`,
      );
    } catch (e) {
      setDohvatPoruka(
        "Dohvat živog rezultata nije uspio: " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setDohvacam(false);
    }
  }

  const brojInput =
    "w-16 rounded-lg border border-input bg-background px-2 py-1 text-xs tabular-nums outline-none focus:border-primary";
  const tekstInput =
    "w-20 rounded-lg border border-input bg-background px-2 py-1 text-xs tabular-nums outline-none focus:border-primary";

  return (
    <section className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Radio className="h-4 w-4 animate-pulse text-cyan-400" /> Live Engine — preračunavanje u
          tijeku utakmice
        </div>
        <button
          onClick={() => void dohvatiLive()}
          disabled={dohvacam}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          title="Dohvati živi rezultat (API-Football, keš 60 s)"
        >
          {dohvacam ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Živi rezultat
        </button>
      </div>

      {!lambdaOk && (
        <p className="text-[11px] text-amber-300">
          Model λ još nije izračunat — otvori analizu utakmice pa se motor aktivira.
        </p>
      )}

      {/* unos stanja */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1">
          Minuta
          <input
            type="number"
            min={0}
            max={120}
            value={minuta}
            onChange={(e) => setMinuta(Number(e.target.value) || 0)}
            className={brojInput}
          />
        </label>
        <label className="flex items-center gap-1">
          {dom.slice(0, 12)}
          <input
            type="number"
            min={0}
            max={15}
            value={goloviDom}
            onChange={(e) => setGoloviDom(Number(e.target.value) || 0)}
            className={brojInput}
          />
        </label>
        <label className="flex items-center gap-1">
          {gost.slice(0, 12)}
          <input
            type="number"
            min={0}
            max={15}
            value={goloviGost}
            onChange={(e) => setGoloviGost(Number(e.target.value) || 0)}
            className={brojInput}
          />
        </label>
        <label className="flex items-center gap-1">
          Crvenih dom
          <input
            type="number"
            min={0}
            max={3}
            value={crveniDom}
            onChange={(e) => setCrveniDom(Number(e.target.value) || 0)}
            className={brojInput}
          />
        </label>
        <label className="flex items-center gap-1">
          Crvenih gost
          <input
            type="number"
            min={0}
            max={3}
            value={crveniGost}
            onChange={(e) => setCrveniGost(Number(e.target.value) || 0)}
            className={brojInput}
          />
        </label>
        {dohvatPoruka && <span className="text-[10px]">{dohvatPoruka}</span>}
      </div>

      {/* LIVE VALUE OPPORTUNITY */}
      {liveValue && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 p-2.5">
          <Zap className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-300">
            LIVE VALUE OPPORTUNITY — uživo kvota kasni za modelom za{" "}
            {(najboljiEdge * 100).toFixed(1)}% edgea!
          </span>
        </div>
      )}

      {/* izlazi */}
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <Bar label="O0.5" p={live.o05} jak={live.o05 > 0.8} />
        <Bar label="O1.5" p={live.o15} jak={live.o15 > 0.8} />
        <Bar label="O2.5" p={live.o25} jak={live.o25 > 0.8} />
        <Bar label="O3.5" p={live.o35} />
        <Bar label="BTTS" p={live.btts} jak={live.btts > 0.8} />
        <Bar label={`1 (${dom.slice(0, 8)})`} p={live.p1} />
        <Bar label="X" p={live.pX} />
        <Bar label={`2 (${gost.slice(0, 8)})`} p={live.p2} />
      </div>

      <div className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-3">
        <span>
          Sljedeći gol: <b className="text-foreground">{P(live.sljedeciDom)}</b> dom /{" "}
          <b className="text-foreground">{P(live.sljedeciGost)}</b> gost / nema više{" "}
          <b className="text-foreground">{P(live.sljedeciNema)}</b>
        </span>
        <span>
          Preostalo: <b className="text-foreground tabular-nums">{live.preostaloMinuta}′</b> · λ
          ostatak {live.lamPreostaloDom.toFixed(2)} / {live.lamPreostaloGost.toFixed(2)}
        </span>
        <span>
          Očekivani konačni:{" "}
          <b className="text-foreground tabular-nums">{live.ocekivaniKonacniRezultat}</b>
        </span>
      </div>

      {/* unos uživo kvota */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Uživo kvote (opciono):</span>
        <label className="flex items-center gap-1">
          O2.5
          <input
            value={kvotaO25}
            onChange={(e) => setKvotaO25(e.target.value)}
            placeholder="npr. 1.75"
            className={tekstInput}
          />
        </label>
        <label className="flex items-center gap-1">
          GG
          <input
            value={kvotaGG}
            onChange={(e) => setKvotaGG(e.target.value)}
            placeholder="npr. 1.90"
            className={tekstInput}
          />
        </label>
        {(kvotaO25 || kvotaGG) && (
          <span>
            Edge O2.5:{" "}
            <b className={edgeO25 > 0 ? "text-emerald-400" : "text-red-400"}>
              {kvotaO25 ? `${(edgeO25 * 100).toFixed(1)}%` : "—"}
            </b>{" "}
            · Edge GG:{" "}
            <b className={edgeGG > 0 ? "text-emerald-400" : "text-red-400"}>
              {kvotaGG ? `${(edgeGG * 100).toFixed(1)}%` : "—"}
            </b>{" "}
            · prag za LIVE VALUE: {(LIVE_VALUE_PRAG * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </section>
  );
}
