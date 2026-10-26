import { useState, useEffect } from "react";
import { testApiKey } from "@/lib/football.functions";
import { getApiKey } from "@/lib/zlatni-guard";
import { clearKey, setKey as saveKey } from "@/lib/storage";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

type Status = {
  ok?: boolean;
  msg: string;
  plan?: string;
  used?: number;
  limit?: number;
  aktiviran?: boolean;
} | null;

export function SettingsModal({ open, onClose, onSaved }: Props) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (open) {
      const saved = getApiKey() || "";
      setKey(saved);
      setStatus(
        saved
          ? {
              ok: true,
              msg: "Ključ je spremljen — aplikacija koristi API-Football podatke.",
              aktiviran: true,
            }
          : null,
      );
    }
  }, [open]);

  if (!open) return null;

  const potvrda = (s: Status) => setStatus(s);

  // AKTIVIRAJ: spremi ključ i odmah testiraj vezu
  const aktiviraj = async () => {
    const k = key.trim();
    if (!k) {
      potvrda({ ok: false, msg: "Prvo upiši API ključ." });
      return;
    }
    setTesting(true);
    potvrda({ ok: true, msg: "Aktiviram — provjeravam vezu…" });
    try {
      const res = await testApiKey({ data: { apiKey: k } });
      if (res.ok) {
        saveKey("apiFootball", k);
        try {
          localStorage.setItem("kr-football-api-key", k);
        } catch {
          /* ignoriraj */
        }
        potvrda({
          ok: true,
          aktiviran: true,
          msg: `Povezano / API Aktivan — plan ${res.plan}${res.active ? " (aktivan)" : " (neaktivan)"}. Ključ je spremljen.`,
          plan: res.plan,
          used: res.current,
          limit: res.limit,
        });
        onSaved?.();
      } else {
        potvrda({ ok: false, msg: `Greška: ${res.error} — ključ nije spremljen.` });
      }
    } catch (e) {
      potvrda({ ok: false, msg: `Mrežna greška: ${e instanceof Error ? e.message : "nepoznato"}` });
    } finally {
      setTesting(false);
    }
  };

  // TESTIRAJ VEZU: testira upisani ključ bez spremanja
  const testiraj = async () => {
    const k = key.trim();
    if (!k) {
      potvrda({ ok: false, msg: "Prvo upiši API ključ." });
      return;
    }
    setTesting(true);
    potvrda({ ok: true, msg: "Testiram vezu…" });
    try {
      const res = await testApiKey({ data: { apiKey: k } });
      if (res.ok) {
        potvrda({
          ok: true,
          msg: `Veza uspješna! Plan: ${res.plan} (${res.active ? "Aktivan" : "Neaktivan"})`,
          plan: res.plan,
          used: res.current,
          limit: res.limit,
        });
      } else {
        potvrda({ ok: false, msg: `Greška: ${res.error}` });
      }
    } catch (e) {
      potvrda({ ok: false, msg: `Mrežna greška: ${e instanceof Error ? e.message : "nepoznato"}` });
    } finally {
      setTesting(false);
    }
  };

  // SPREMI: spremi ključ u postavke (bez obaveznog testa)
  const spremi = () => {
    const k = key.trim();
    if (k) {
      saveKey("apiFootball", k);
      try {
        localStorage.setItem("kr-football-api-key", k);
      } catch {
        /* ignoriraj */
      }
      potvrda({
        ok: true,
        msg: "Ključ spremljen. Klikni 'Aktiviraj' za potvrdu veze.",
        aktiviran: true,
      });
      onSaved?.();
    } else {
      clearKey("apiFootball");
      try {
        localStorage.removeItem("kr-football-api-key");
      } catch {
        /* ignoriraj */
      }
      potvrda({ ok: true, msg: "Ključ uklonjen iz memorije." });
      onSaved?.();
    }
  };

  const obrisi = () => {
    clearKey("apiFootball");
    try {
      localStorage.removeItem("kr-football-api-key");
    } catch {
      /* ignoriraj */
    }
    setKey("");
    potvrda({ ok: true, msg: "Ključ uklonjen iz memorije." });
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-lg font-bold text-card-foreground">⚙️ API-Football Configuration</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Status indikator: zeleni puls = Povezano, crveno = Greška */}
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status?.ok
                  ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                  : status && status.ok === false
                    ? "bg-red-500"
                    : "bg-muted-foreground/40"
              }`}
            />
            <span
              className={`text-xs font-semibold ${status?.ok ? "text-emerald-400" : status && status.ok === false ? "text-red-400" : "text-muted-foreground"}`}
            >
              {status?.ok
                ? "Povezano / API Aktivan"
                : status && status.ok === false
                  ? "Greška / Nevažeći ključ"
                  : "Nije povezano"}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              API-Sports / API-Football Ključ
            </label>
            <div className="relative mt-1">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Unesi svoj API ključ..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-16 text-sm text-foreground"
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
              Besplatan račun i ključ preuzmi na{" "}
              <a
                href="https://dashboard.api-football.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                api-football.com
              </a>{" "}
              (100 besplatnih poziva dnevno).
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
                  Iskorišteno danas: <strong>{status.used}</strong> / {status.limit} poziva
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={aktiviraj}
              disabled={testing}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              ⚡ Aktiviraj
            </button>
            <button
              onClick={testiraj}
              disabled={testing}
              className="flex-1 rounded-lg border border-input bg-secondary px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              {testing ? "Testiram..." : "🔍 Testiraj vezu"}
            </button>
            <button
              onClick={spremi}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              💾 Spremi
            </button>
          </div>

          {key && (
            <button
              onClick={obrisi}
              className="w-full text-center text-xs text-muted-foreground hover:text-destructive"
            >
              Ukloni spremljeni ključ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
