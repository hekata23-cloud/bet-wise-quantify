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
          <KeyRound className="h-4 w-4 text-primary" />
          API-Football ključ za karticu
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Zatvori"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3 text-xs space-y-2.5">
        <p className="text-muted-foreground">
          Upiši svoj besplatni ključ s <strong>api-football.com</strong>. Kada je aktiviran,
          kartica prikazuje stvarne kladioničarske kvote umjesto virtualnog modela.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Zalijepi API ključ (32 znaka)…"
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {showKey ? "Sakrij" : "Prikaži"}
            </button>
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={testing}
              onClick={aktiviraj}
              className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {testing ? "Provjera…" : "Aktiviraj"}
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={testiraj}
              className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              Testiraj
            </button>
            {key && (
              <button
                type="button"
                onClick={ukloni}
                className="rounded-md border border-destructive/40 px-2 py-1.5 text-destructive hover:bg-destructive/10"
                title="Ukloni ključ"
              >
                Ukloni
              </button>
            )}
          </div>
        </div>

        {status && (
          <div
            className={`rounded-md p-2 font-mono text-[11px] ${
              status.ok
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}
          >
            {status.msg}
            {status.used !== undefined && status.limit !== undefined && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Iskorišteno danas: {status.used} / {status.limit} poziva
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/80">
          Besplatni račun daje 100 poziva/dan. Registracija:{" "}
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

