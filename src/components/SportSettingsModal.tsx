import { useState, useEffect } from "react";
import { testApiKeySport } from "@/lib/sportovi.functions";
import { getApiKey } from "@/lib/zlatni-guard";
import { clearKey, setKey as saveKey } from "@/lib/storage";

type Sport = "kosarka" | "rukomet";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  sport: Sport;
};

const SPORT_NAZIV: Record<Sport, string> = {
  kosarka: "Košarka",
  rukomet: "Rukomet",
};

const SPORT_BASE: Record<Sport, string> = {
  kosarka: "v1.basketball.api-sports.io",
  rukomet: "v1.handball.api-sports.io",
};

export function SportSettingsModal({ open, onClose, onSaved, sport }: Props) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{
    ok?: boolean;
    msg: string;
    plan?: string;
    used?: number;
    limit?: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      const saved = getApiKey() || "";
      setKey(saved);
      setStatus(null);
    }
  }, [open]);

  if (!open) return null;

  const testiraj = async () => {
    if (!key.trim()) {
      setStatus({ ok: false, msg: "Prvo upiši API ključ." });
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const res = await testApiKeySport({ data: { sport, apiKey: key.trim() } });
      if (res.ok) {
        const zaostalo = res.limit - res.current;
        setStatus({
          ok: true,
          msg: `Veza uspješna! Plan: ${res.plan} (${res.active ? "Aktivan" : "Neaktivan"}) — ${SPORT_NAZIV[sport]} endpoint radi ✓`,
          plan: res.plan,
          used: res.current,
          limit: res.limit,
        });
        if (zaostalo <= 10) {
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  msg: prev.msg + ` ⚠️ Preostalo samo ${zaostalo} od ${res.limit} dnevnih poziva.`,
                }
              : prev,
          );
        }
      } else {
        const poruka = res.error ?? "Nepoznata greška";
        const savjet = /not|sport|activ|subscr|plan/i.test(poruka)
          ? " — Provjeri je li sport aktiviran na api-sports.io dashboardu."
          : "";
        setStatus({ ok: false, msg: `Greška: ${poruka}${savjet}` });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Nepoznato";
      setStatus({ ok: false, msg: `Mrežna greška: ${msg}` });
    } finally {
      setTesting(false);
    }
  };

  const spremi = () => {
    const k = key.trim();
    if (k) {
      saveKey("apiFootball", k);
      localStorage.setItem("kr-football-api-key", k);
    } else {
      clearKey("apiFootball");
      localStorage.removeItem("kr-football-api-key");
    }
    onSaved?.();
    onClose();
  };

  const obrisi = () => {
    clearKey("apiFootball");
    localStorage.removeItem("kr-football-api-key");
    setKey("");
    setStatus({ ok: true, msg: "Ključ uklonjen iz memorije." });
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h3 className="text-lg font-bold text-card-foreground">
            ⚙️ Postavke {SPORT_NAZIV[sport]} API-ja
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              API-Sports Ključ ({SPORT_NAZIV[sport]})
            </label>
            <div className="relative mt-1">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Unesi svoj API ključ..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground pr-16"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showKey ? "Sakrij" : "Prikaži"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Besplatan račun preuzmi na{" "}
              <a
                href="https://dashboard.api-sports.io"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                api-sports.io
              </a>{" "}
              i aktiviraj <strong>{SPORT_NAZIV[sport]}</strong> (
              <code className="text-xs bg-secondary px-1 rounded">{SPORT_BASE[sport]}</code>) — 100
              besplatnih poziva dnevno po sportu.
            </p>
            <p className="mt-1 text-xs text-amber-400/90">
              ⚠️ Isti ključ radi za sve sportove, ali svaki sport ima{" "}
              <strong>vlastitu kvotu od 100/dan</strong>. Potrošena football kvota ne utječe na
              košarku/rukomet.
            </p>
          </div>

          {status && (
            <div
              className={`rounded-lg p-3 text-xs ${
                status.ok
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              <p className="font-semibold">{status.msg}</p>
              {status.limit !== undefined && (
                <p className="mt-1">
                  Iskorišteno danas ({SPORT_NAZIV[sport]}): <strong>{status.used}</strong> /{" "}
                  {status.limit} poziva
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={testiraj}
              disabled={testing}
              className="flex-1 rounded-lg border border-input bg-secondary px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              {testing ? "Testiram..." : `🔍 Testiraj za ${SPORT_NAZIV[sport]}`}
            </button>
            <button
              onClick={spremi}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              💾 Spremi i aktiviraj
            </button>
          </div>

          <div className="flex justify-end">
            <button onClick={obrisi} className="text-xs text-destructive hover:underline">
              🗑️ Ukloni ključ
            </button>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-300">
            <p className="font-semibold mb-1">ℹ️ Kako aktivirati sport?</p>
            <ol className="space-y-1 list-decimal list-inside text-blue-300/90">
              <li>
                Idi na{" "}
                <a
                  href="https://dashboard.api-sports.io"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  dashboard.api-sports.io
                </a>
              </li>
              <li>
                Odaberi <strong>My Subscriptions</strong>
              </li>
              <li>
                Pronađi <strong>{SPORT_NAZIV[sport]}</strong> i klikni <strong>Subscribe</strong>{" "}
                (besplatno)
              </li>
              <li>Isti API ključ vrijedi za sve sportove</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
