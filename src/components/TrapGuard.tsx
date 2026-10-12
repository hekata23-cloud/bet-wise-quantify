import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, X } from "lucide-react";
import { analyzeTraps, TRAP_EVENT, type Trap } from "@/lib/trap-detector";
import { loadLastPredictorInputs } from "@/lib/predictor-bridge";

/** Globalni čuvar: aktivan na svakoj kartici, reagira čim se učitaju kvote utakmice. */
export function TrapGuard() {
  const [traps, setTraps] = useState<Trap[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let last = "";
    const scan = (notify: boolean) => {
      const t = analyzeTraps(loadLastPredictorInputs());
      const sig = JSON.stringify(t.map((x) => [x.market, x.favOdd, x.dogOdd]));
      setTraps(t);
      if (notify && t.length && sig !== last) {
        toast.warning(`⚠️ Detektor zamki: ${t[0].message}`, { duration: 8000 });
        setOpen(true);
      }
      last = sig;
    };
    scan(false);
    const onEvt = () => scan(true);
    window.addEventListener(TRAP_EVENT, onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener(TRAP_EVENT, onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, []);

  if (!traps.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-destructive/50 bg-card px-4 py-2 text-sm font-semibold text-destructive shadow-lg">
          <ShieldAlert className="h-4 w-4" /> {traps.length} zamka
        </button>
      ) : (
        <div className="rounded-2xl border border-destructive/50 bg-card p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <ShieldAlert className="h-4 w-4" /> Detektor zamki
            </div>
            <button onClick={() => setOpen(false)} aria-label="Zatvori"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {traps.map((t, k) => (
              <div key={k} className="rounded-lg bg-secondary p-2 text-xs">
                <div className="font-semibold">[{t.level}] {t.market}</div>
                <div className="text-muted-foreground">{t.message}</div>
                <div className="mt-1 text-primary">💡 {t.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
