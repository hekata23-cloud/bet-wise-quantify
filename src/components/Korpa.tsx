// ============================================================
// KORPA.TSX — Bet Slip / Tiket (lebdeći panel, cijela aplikacija)
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { ShoppingCart, Trash2, X, Copy, Coins, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  loadKorpa, ukloniIzKorpe, ocistiKorpu, izracunajKorpu,
  type KorpaTip,
} from "@/lib/korpa";
import { loadJSON, saveJSON } from "@/lib/storage";

const BANKROLL_KEY = "andromeda.bankroll";
const KELLY_KEY = "andromeda.kelly.frac";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function Korpa() {
  const [open, setOpen] = useState(false);
  const [tipovi, setTipovi] = useState<KorpaTip[]>([]);
  const [bankroll, setBankroll] = useState<number>(() => loadJSON<number>(BANKROLL_KEY, 100));
  const [kellyFrac, setKellyFrac] = useState<number>(() => loadJSON<number>(KELLY_KEY, 0.25));

  const osvjezi = useCallback(() => setTipovi(loadKorpa()), []);

  useEffect(() => {
    osvjezi();
    const h = () => osvjezi();
    window.addEventListener("andromeda:korpa", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("andromeda:korpa", h);
      window.removeEventListener("storage", h);
    };
  }, [osvjezi]);

  useEffect(() => saveJSON(BANKROLL_KEY, bankroll), [bankroll]);
  useEffect(() => saveJSON(KELLY_KEY, kellyFrac), [kellyFrac]);

  const r = izracunajKorpu(tipovi, { bankroll, kellyFrac });

  function kopirajListic() {
    const linije = tipovi.map(
      (t, i) => `${i + 1}. [${t.sport}] ${t.utakmica} — ${t.trziste}: ${t.tip} @ ${t.kvota.toFixed(2)} (model ${pct(t.vjerojatnost)})`,
    );
    const tekst = [
      "ANDROMEDA AI — Tiket",
      ...linije,
      `──────────────`,
      `Ukupna kvota: ${r.kvota.toFixed(2)}`,
      `Vjerojatnost modela: ${pct(r.vjerojatnost)}`,
      `EV: ${pct(r.edge)}`,
      `Preporučeni ulog (frakcijski Kelly): ${r.ulogPerc.toFixed(2)}% = ${r.ulogIznos.toFixed(2)} €`,
    ].join("\n");
    navigator.clipboard?.writeText(tekst).then(
      () => toast.success("Tiket kopiran u međuspremnik"),
      () => toast.error("Kopiranje nije uspjelo"),
    );
  }

  return (
    <>
      {/* Lebdeći gumb — dolje lijevo */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-card shadow-xl shadow-black/40 transition-transform hover:scale-105"
        title="Korpa — Tiket"
        aria-label="Korpa"
      >
        <ShoppingCart className="h-5 w-5 text-emerald-400" />
        {tipovi.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {tipovi.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 left-4 z-50 flex max-h-[75vh] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="text-sm font-semibold">Korpa — Tiket</div>
                <div className="text-[10px] text-muted-foreground">
                  Frakcijski Kelly · EV · rizik varijance
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-muted/60" aria-label="Zatvori">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Postavke bankrolla */}
          <div className="flex items-center gap-2 border-b border-border/40 bg-card/30 px-4 py-2 text-xs">
            <Coins className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Bankroll:</span>
            <input
              type="number"
              min={0}
              value={bankroll}
              onChange={(e) => setBankroll(Math.max(0, Number(e.target.value) || 0))}
              className="w-24 rounded-md border border-border/60 bg-background px-2 py-1 text-right font-mono"
            />
            <span className="text-muted-foreground">€</span>
            <span className="ml-auto text-muted-foreground">Kelly:</span>
            <select
              value={kellyFrac}
              onChange={(e) => setKellyFrac(Number(e.target.value))}
              className="rounded-md border border-border/60 bg-background px-1.5 py-1"
            >
              <option value={0.1}>10%</option>
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
            </select>
          </div>

          {/* Noge tiketa */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {tipovi.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Korpa je prazna. Na karticama klikni <span className="font-semibold text-emerald-400">+ Korpa</span> na
                tipu koji želiš ig­rati.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {tipovi.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-2 text-xs">
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                      {t.sport.slice(0, 3)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.utakmica}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {t.trziste}: <span className="font-semibold text-emerald-400">{t.tip}</span> · model {pct(t.vjerojatnost)}
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold">{t.kvota.toFixed(2)}</span>
                    <button
                      onClick={() => ukloniIzKorpe(t.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Ukloni"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Sažetak */}
          {tipovi.length > 0 && (
            <div className="space-y-2 border-t border-border/60 bg-card/60 px-4 py-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ukupna kvota</span>
                <span className="font-mono font-bold">{r.kvota.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vjerojatnost modela</span>
                <span className="font-mono">{pct(r.vjerojatnost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">EV (edge)</span>
                <span className={`font-mono font-bold ${r.edge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {r.edge >= 0 ? "+" : ""}{pct(r.edge)}
                </span>
              </div>
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-muted-foreground">Rizik varijance</span>
                  <span className="font-mono">{r.rizikPerc}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${r.rizikPerc > 60 ? "bg-red-500" : r.rizikPerc > 35 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${r.rizikPerc}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2">
                <span className="font-semibold text-emerald-300">Preporučeni ulog (Kelly)</span>
                <span className="font-mono font-bold text-emerald-300">
                  {r.ulogPerc.toFixed(2)}% = {r.ulogIznos.toFixed(2)} €
                </span>
              </div>
              {(r.korelacijaUkorenje as unknown) || r.korelacijaUpozorenje ? null : null}
              {r.korelacijaUpozorenje && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Više nogu iz iste utakmice — ishodi su povezani. Ulog je automatski smanjen na pola.</span>
                </div>
              )}
              {!r.isplativo && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Nema vrijednosti (EV ≤ 0) — preporučam ne igrati ovaj tiket ili ga smanjiti.</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={kopirajListic}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Copy className="h-3.5 w-3.5" /> Kopiraj listić
                </button>
                <button
                  onClick={() => { ocistiKorpu(); toast.success("Korpa očišćena"); }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Očisti
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

