// ============================================================
// LINEUP RADAR — Confirmed Lineup Scanner & Impact Adjustment
// Dohvaća službene postave (API-Football /fixtures/lineups),
// uspoređuje ih s prijašnjim snimkom i računa pomak λ.
// Sve greške hvata — nikad ne ruši karticu.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { afGet, ApiFootballError } from "@/lib/api-football";
import {
  analizirajPostave, parsirajPostave, procijeniUtjecajPostava,
  usporediPostaveTim, type PostavaTim, type UtjecajPostave,
} from "@/lib/lineup-engine";

export interface LineupInfo {
  potvrdjene: boolean;
  utjecaj: UtjecajPostave | null;
}

interface LineupRadarProps {
  fixtureId: number;
  dom: string;
  gost: string;
  /** MatchInsightPanel preko ovoga snima pomak u AI kontekst */
  onImpact?: (info: LineupInfo) => void;
}

const HIST_KEY = (id: number) => `andromeda.lineup.hist.${id}`;

interface HistZapis { dom: PostavaTim | null; gost: PostavaTim | null }

function citajHist(id: number): HistZapis | null {
  try {
    const raw = localStorage.getItem(HIST_KEY(id));
    return raw ? (JSON.parse(raw) as HistZapis) : null;
  } catch { return null; }
}

function pisiHist(id: number, z: HistZapis) {
  try { localStorage.setItem(HIST_KEY(id), JSON.stringify(z)); } catch { /* ignoriraj */ }
}

type Status = "ucitavam" | "potvrdjene" | "nepotvrdjene" | "greska";

export function LineupRadar({ fixtureId, dom, gost, onImpact }: LineupRadarProps) {
  const [status, setStatus] = useState<Status>("ucitavam");
  const [poruka, setPoruka] = useState("");
  const [utjecaj, setUtjecaj] = useState<UtjecajPostave | null>(null);
  const [formacija, setFormacija] = useState<string | null>(null);
  const pokrenuto = useRef(false);

  useEffect(() => {
    if (pokrenuto.current) return; // zaštita od dvostrukog mounta
    pokrenuto.current = true;
    void dohvati(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureId]);

  async function dohvati(force: boolean) {
    setStatus("ucitavam");
    setPoruka(force ? "Osvježavam postave (1 API poziv)…" : "");
    try {
      const resp = await afGet<any>(
        "fixtures/lineups",
        { fixture: fixtureId },
        { ttlMs: 10 * 60 * 1000, force },
      );
      const postave = parsirajPostave(resp);
      if (postave.length < 2) {
        setStatus("nepotvrdjene");
        setUtjecaj(null);
        setFormacija(null);
        onImpact?.({ potvrdjene: false, utjecaj: null });
        return;
      }
      const analiza = analizirajPostave(postave);
      const hist = citajHist(fixtureId);
      const razlika = {
        izasliDom: usporediPostaveTim(hist?.dom ?? null, postave[0]).izasli,
        izasliGost: usporediPostaveTim(hist?.gost ?? null, postave[1]).izasli,
        usliDom: usporediPostaveTim(hist?.dom ?? null, postave[0]).usli,
        usliGost: usporediPostaveTim(hist?.gost ?? null, postave[1]).usli,
      };
      const u = procijeniUtjecajPostava(razlika);
      pisiHist(fixtureId, { dom: postave[0], gost: postave[1] });
      setFormacija(
        postave[0]?.formacija && postave[1]?.formacija
          ? `${postave[0].formacija} vs ${postave[1].formacija}`
          : postave[0]?.formacija ?? null,
      );
      const finalna = u.imaUtjecaj ? u : null;
      setUtjecaj(finalna);
      setStatus(analiza.potvrdjene ? "potvrdjene" : "nepotvrdjene");
      onImpact?.({ potvrdjene: analiza.potvrdjene, utjecaj: finalna });
    } catch (e) {
      setStatus("greska");
      const msg = e instanceof ApiFootballError ? e.message : String(e);
      setPoruka(msg.includes("Nedostaje") ? "Nedostaje API-Football ključ (Postavke)." : msg);
      setUtjecaj(null);
      onImpact?.({ potvrdjene: false, utjecaj: null });
    }
  }

  const badge =
    status === "ucitavam" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Provjeravam postave…
      </span>
    ) : status === "potvrdjene" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
        <ShieldCheck className="h-3 w-3" /> Potvrđene postave (verificirano)
      </span>
    ) : status === "nepotvrdjene" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
        <ShieldAlert className="h-3 w-3" /> Nepotvrđene postave
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">
        <ShieldAlert className="h-3 w-3" /> Postave: nedostupno
      </span>
    );

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-teal-400" /> Postave
          {badge}
          {formacija && (
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{formacija}</span>
          )}
        </div>
        <button
          onClick={() => void dohvati(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Osvježi postave (novi API poziv)"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Osvježi
        </button>
      </div>

      {utjecaj?.imaUtjecaj && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="text-xs font-bold text-amber-300">
            ⚠ LINEUP SHIFT DETECTED — vjerojatnost preračunata za {utjecaj.procenat > 0 ? "+" : ""}{utjecaj.procenat}%
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-amber-200/90">
            {utjecaj.opisi.slice(0, 4).map((o, i) => <li key={i}>• {o}</li>)}
          </ul>
          <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>λ domaćin ×{utjecaj.faktorDom.toFixed(2)}</span>
            <span>λ gost ×{utjecaj.faktorGost.toFixed(2)}</span>
            <span>({dom} — {gost})</span>
          </div>
        </div>
      )}

      {status === "greska" && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{poruka}</p>
      )}
      {status === "nepotvrdjene" && !utjecaj?.imaUtjecaj && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Službene postave obično izlaze ~45 min prije početka. Do tada model koristi puni sastav.
        </p>
      )}
    </section>
  );
}
