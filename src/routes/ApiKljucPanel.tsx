/* ============================================================
   APIKLJUCPANEL.TSX — brzi unos / test / aktivacija API-Football ključa
   • Kompaktan inline panel za kartice (prvi korisnik: Virtualna Kladionica).
   • AKTIVIRAJ = testira vezu (GET /status) pa tek onda sprema ključ u
     iste slotove kao Postavke: "tm.key.apiFootball" + "kr-football-api-key".
   • TESTIRAJ = provjeri upisani ključ bez spremanja.  UKLONI = obriši memoriju.
   • Status: zeleno (povezano — plan + potrošnja) / crveno (greška).
   • onAktivirano: pozivatelj odmah osvježava podatke (npr. ponovno učitava
     kvote) — bez osvježavanja stranice ili promjene sporta/dana.
   ============================================================ */
import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { testApiKey } from "@/lib/football.functions";
import { getApiKey } from "@/lib/zlatni-guard";
import { clearKey, setKey as saveKey } from "@/lib/storage";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Poziva se nakon uspješne aktivacije ili uklanjanja ključa. */
  onAktivirano?: () => void;
};

type Status = {
  ok?: boolean;
  msg: string;
  plan?: string;
  used?: number;
  limit?: number;
  aktiviran?: boolean;
} | null;

export function ApiKljucPanel({ open, onClose, onAktivirano }: Props) {
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
          ? { ok: true, msg: "Ključ je spremljen — kartica koristi API-Football podatke.", aktiviran: true }
          : null,
      );
    }
  }, [open]);

  if (!open) return null;

  const potvrda = (s: Status) => setStatus(s);

  // AKTIVIRAJ: testira vezu pa sprema ključ samo ako je veza uspješna
  const aktiviraj = async () => {
    const k = key.trim();
    if (!k) { potvrda({ ok: false, msg: "Prvo upiši API ključ." }); return; }
    setTesting(true);
    potvrda({ ok: true, msg: "Aktiviram — provjeravam vezu…" });
    try {
      const res = await testApiKey({ data: { apiKey: k } });
      if (res.ok) {
        saveKey("apiFootball", k);
        try { localStorage.setItem("kr-football-api-key", k); } catch { /* ignoriraj */ }
        potvrda({
          ok: true, aktiviran: true,
          msg: `✅ Povezano — plan ${res.plan}${res.active ? " (aktivan)" : " (neaktivan)"}. Ključ je spremljen, kvote se učitavaju.`,
          plan: res.plan, used: res.current, limit: res.limit,
        });
        onAktivirano?.();
      } else {
        potvrda({ ok: false, msg: `❌ Greška: ${res.error} — ključ NIJE spremljen.` });
      }
    } catch (e) {
      potvrda({ ok: false, msg: `Mrežna greška: ${e instanceof Error ? e.message : "nepoznato"}` });
    } finally {
      setTesting(false);
    }
  };

  // TESTIRAJ: provjeri upisani ključ bez spremanja
  const testiraj = async () => {
    const k = key.trim();
    if (!k) { potvrda({ ok: false, msg: "Prvo upiši API ključ." }); return; }
    setTesting(true);
    potvrda({ ok: true, msg: "Testiram vezu…" });
    try {
      const res = await testApiKey({ data: { apiKey: k } });
      if (res.ok) {
        potvrda({
          ok: true,
          msg: `✅ Veza uspješna! Plan: ${res.plan} (${res.active ? "Aktivan" : "Neaktivan"})`,
          plan: res.plan, used: res.current, limit: res.limit,
        });
      } else {
        potvrda({ ok: false, msg: `❌ Greška: ${res.error}` });
      }
    } catch (e) {
      potvrda({ ok: false, msg: `Mrežna greška: ${e instanceof Error ? e.message : "nepoznato"}` });
    } finally {
      setTesting(false);
    }
  };

  const ukloni = () => {
    clearKey("apiFootball");
    try { localStorage.removeItem("kr-football-api-key"); } catch { /* ignoriraj */ }
    setKey("");
    potvrda({ ok: true, msg: "Ključ uklonjen — kartica se vraća na virtualne kvote modela." });
    onAktivirano?.();
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <KeyRound className="h-4 w-4 text-amber-400" /> API-Football ključ — unos, test i aktivacija
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Zatvori">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
          <input
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Zalijepi API ključ (npr. f4b3a1...)"
            className="w-full bg-transparent text-sm outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={() => setShowKey((s) => !s)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
            {showKey ? "Sakrij" : "Prikaži"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
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
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-50"
          >
            Testiraj
          </button>
          <button
            onClick={ukloni}
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-destructive"
          >
            Ukloni
          </button>
        </div>
        {status && (
          <div
            className={`rounded-lg p-2.5 text-xs ${
              status.ok ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border border-red-500/30 bg-red-500/10 text-red-400"
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
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Besplatan ključ:{" "}
          <a href="https://dashboard.api-football.com" target="_blank" rel="noreferrer" className="text-primary underline">
            dashboard.api-football.com
          </a>{" "}
          (100 poziva/dan). Kvote postoje samo za buduće utakmice (obično sljedećih ~7 dana) —
          započete i prošle utakmice nemaju kvote, za njih vrijede virtualne kvote modela.
        </p>
      </div>
    </div>
  );
}
