// ============================================================
// KORPA.TSX — Bet Slip / Tiket Optimizer (v4)
// Globalno stanje: KorpaProvider (React Context) + localStorage
// persistencija (src/lib/korpa-store.tsx). Sport i tržište se
// automatski prepoznaju iz naziva utakmice i linija
// (src/lib/sport-detect.ts). Matematički indikatori rizika:
// EV klasifikacija, Shannon-entropija varijansa, frakcijski Kelly
// (src/lib/bet-slip-math.ts + korpa-smart.ts).
// UI: dark-mode kartica, na mobitelu bottom sheet.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ShoppingCart, Trash2, X, Copy, Coins, AlertTriangle, Link2, Layers,
  Share2, Download, Lock, Loader2, MessageCircle, GripHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useKorpa } from "@/lib/korpa-store";
import { varijancaTiketa, type KorpaTip } from "@/lib/korpa";
import { izracunajKorpuSmart } from "@/lib/korpa-smart";
import { detectSport, formatSelectionLabel, SPORT_BADGE, type Sport } from "@/lib/sport-detect";
import { evStatus, visokaVarijanca, potentialReturn } from "@/lib/bet-slip-math";
import { podijeliTiket, preuzmiTiket } from "@/lib/tiket-slika";
import { spremiKontekstTiketa } from "@/lib/ai-context";
import { spremiListic, nogaIzKorpe } from "@/lib/listici";
import { useIsMobile } from "@/hooks/use-mobile";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Boje badgea po sportu (dark-mode kartica). */
const SPORT_BOJE: Record<Sport, string> = {
  nogomet: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "košarka": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  rukomet: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

const EV_BOJE = {
  pozitivan: "text-emerald-400",
  neutralan: "text-muted-foreground",
  negativan: "text-red-400",
} as const;

export function Korpa() {
  const { tipovi, ulog, bankroll, kellyFrac, ukloni, ocisti, setUlog, setBankroll, setKellyFrac } = useKorpa();
  const [open, setOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // High Variance Warning: događaj iz korpa.ts kad noga ima < 55% modela
  useEffect(() => {
    const w = (e: Event) => {
      const poruka = (e as CustomEvent<{ poruka?: string }>).detail?.poruka;
      toast.warning(poruka || "High Variance Warning: noga s manje od 55% vjerojatnosti je u korpi. Paraj je samo sa sigurnim nogama.");
    };
    window.addEventListener("andromeda:korpa-upozorenje", w);
    return () => window.removeEventListener("andromeda:korpa-upozorenje", w);
  }, []);

  const r = izracunajKorpuSmart(tipovi, { bankroll, kellyFrac });
  const korekcija = r.n > 0 && Math.abs(r.pKorigirana - r.pNaive) > 0.0001;
  // TICKET VARIANCE SCORE: Shannon entropija svih noga
  const vj = varijancaTiketa(tipovi);
  const coinFlip = visokaVarijanca(vj.entropija);
  const ev = evStatus(r.edgeKorigirana);

  const ulogBroj = useMemo(() => {
    const v = Number(ulog.replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [ulog]);
  const efektivniUlog = ulogBroj > 0 ? ulogBroj : r.ulogIznos;
  const povrat = potentialReturn(efektivniUlog, r.kvota);

  // TIKET KONTEKST za Lunu/Oriona: sprema se svaki put kad se korpa promijeni
  useEffect(() => {
    if (tipovi.length === 0) return;
    spremiKontekstTiketa({
      brojNoga: r.n,
      kvota: r.kvota,
      vjerojatnost: r.pKorigirana,
      edge: r.edgeKorigirana,
      korelacijaUpozorenje: r.korelacijaUpozorenje,
      nemoguceNoge: r.nemoguceNoge,
      varijanca: {
        razina: vj.razina,
        entropija: vj.entropija,
        remiPushNoge: vj.remiPushNoge,
        upozorenje: vj.upozorenje,
      },
      noge: tipovi.map((t) => ({
        utakmica: t.utakmica, trziste: t.trziste, tip: t.tip,
        kvota: t.kvota, p: t.vjerojatnost,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipovi]);

  // LOCK BET: loading stanje pa virtualno odigravanje u "Moji listići"
  function zakljucajListic() {
    if (tipovi.length === 0 || locking) return;
    if (!(efektivniUlog > 0)) { toast.error("Unesi ulog u € (npr. 5)."); return; }
    setLocking(true);
    window.setTimeout(() => {
      const tiket = spremiListic(tipovi.map(nogaIzKorpe), efektivniUlog);
      setLocking(false);
      if (!tiket) { toast.error("Listić nije spremljen — provjeri noge i ulog."); return; }
      ocisti();
      setUlog("");
      toast.success(`Listić zaključan — ulog ${efektivniUlog.toFixed(2)} € · prati ga u "Moji listići"`);
      navigate({ to: "/listici" });
    }, 800);
  }

  // PITAJ LUNU: šalje aktivni listić u Lunin chat (kontekst je već spremljen)
  function pitajLunu() {
    if (tipovi.length === 0) return;
    const pitanje =
      `Analiziraj moj aktivni listić (podaci su ti u kontekstu tiketa): ${r.n} noga, ukupna kvota ${r.kvota.toFixed(2)}, ` +
      `korelacijski korigirana vjerojatnost ${(r.pKorigirana * 100).toFixed(1)}%. Daj mi: ` +
      `1) ukupnu vjerojatnost prolaza u % i koliko je realna uz maržu kvota, ` +
      `2) NOGU S NAJVEĆIM RIZIKOM (najniža sigurnost) i zašto je slaba, ` +
      `3) preporučeni ulog po frakcijskom Kellyju i jasno "igraj" ili "preskoči" odluku.`;
    try { localStorage.setItem("pc.luna.pitanje", pitanje); } catch { /* ignoriraj */ }
    navigate({ to: "/chat" });
  }

  async function podijeliListic() {
    try {
      const r2 = await podijeliTiket(tipovi, bankroll, kellyFrac);
      toast.success(r2 === "podijeljeno" ? "Tiket podijeljen" : "PNG spremljen u Preuzimanja");
    } catch {
      toast.error("Dijeljenje tiketa nije uspjelo");
    }
  }

  async function preuzmiListic() {
    try {
      await preuzmiTiket(tipovi, bankroll, kellyFrac);
      toast.success("PNG tiket preuzet");
    } catch {
      toast.error("Generiranje PNG-a nije uspjelo");
    }
  }

  const kopirajListic = useCallback(() => {
    const linije = tipovi.map(
      (t, i) => `${i + 1}. ${formatSelectionLabel(t)} @ ${t.kvota.toFixed(2)} (model ${pct(t.vjerojatnost)})`,
    );
    const tekst = [
      "ANDROMEDA AI — Tiket",
      ...linije,
      `──────────────`,
      `Ukupna kvota: ${r.kvota.toFixed(2)}`,
      `Vjerojatnost (korelacijski korigirana): ${pct(r.pKorigirana)}`,
      korekcija ? `Naivna vjerojatnost (bez korelacije): ${pct(r.pNaive)}` : "",
      `EV (korigirani): ${pct(r.edgeKorigirana)}`,
      `Preporučeni ulog (frakcijski Kelly): ${r.ulogPerc.toFixed(2)}% bankrolla = ${r.ulogIznos.toFixed(2)} €`,
    ].filter(Boolean).join("\n");
    navigator.clipboard?.writeText(tekst).then(
      () => toast.success("Tiket kopiran u međuspremnik"),
      () => toast.error("Kopiranje nije uspjelo"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipovi, bankroll, kellyFrac]);

  const nogaRed = (t: KorpaTip) => {
    const sport = detectSport(t);
    return (
      <li key={t.id} className="rounded-xl border border-border/40 bg-card/50 px-3 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${SPORT_BOJE[sport]}`}>
            {SPORT_BADGE[sport]}
          </span>
          <span className="ml-auto font-mono text-sm font-bold">{t.kvota.toFixed(2)}</span>
          <button
            onClick={() => ukloni(t.id)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
            aria-label={`Ukloni ${t.tip}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1 truncate font-medium" title={formatSelectionLabel(t)}>
          {formatSelectionLabel(t)}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          model {pct(t.vjerojatnost)}
          {t.vjerojatnost < 0.55 && (
            <span className="ml-1 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-300">
              ⚠ &lt;55%
            </span>
          )}
        </div>
      </li>
    );
  };

  const panelSadrzaj = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-emerald-400" />
          <div>
            <div className="text-sm font-semibold">Bet Slip — Tiket Optimizer</div>
            <div className="text-[10px] text-muted-foreground">
              Frakcijski Kelly · korelacijski motor · auto sport detekcija
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {tipovi.length > 0 && (
            <button
              onClick={() => { ocisti(); toast.success("Korpa očišćena"); }}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label="Očisti cijeli listić"
            >
              <Trash2 className="h-3.5 w-3.5" /> Očisti
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-muted/60" aria-label="Zatvori">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Postavke bankrolla */}
      <div className="flex items-center gap-2 border-b border-border/40 bg-card/30 px-4 py-2 text-xs">
        <Coins className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Bankroll:</span>
        <input
          type="number"
          min={0}
          value={bankroll}
          onChange={(e) => setBankroll(Number(e.target.value) || 0)}
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

      {/* Selekcije */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {tipovi.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Listić je prazan. Na karticama klikni <span className="font-semibold text-emerald-400">+ Korpa</span> na
            tipu koji želiš igrati.
          </div>
        ) : (
          <ul className="space-y-1.5">{tipovi.map(nogaRed)}</ul>
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
            <span className="text-muted-foreground">Procijenjena vjerojatnost {korekcija ? "(korelacijski korigirana)" : ""}</span>
            <span className="font-mono">{pct(r.pKorigirana)}</span>
          </div>
          {korekcija && (
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Naivna (bez korelacije)</span>
              <span className="font-mono">{pct(r.pNaive)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Očekivana vrijednost (EV)</span>
            <span className={`font-mono font-bold ${EV_BOJE[ev]}`}>
              {r.edgeKorigirana >= 0 ? "+" : ""}{pct(r.edgeKorigirana)}
            </span>
          </div>

          {/* HIGH VARIANCE BADGE — Shannon entropija ≈ 1.0 (50/50 coin-flip) */}
          {coinFlip && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Alert: High Variance (50/50 Coin-flip) — entropija {(vj.entropija * 100).toFixed(0)}%. Tiket je praktički bacanje novčića; smanji ulog ili izbaci najneizvjesniju nogu.</span>
            </div>
          )}
          {!coinFlip && r.n > 0 && (
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-muted-foreground">Varijansa tiketa</span>
                <span className={`font-mono font-semibold ${vj.razina === "balansirana" ? "text-amber-400" : "text-emerald-400"}`}>
                  {vj.razina === "balansirana" ? "Balanced" : "Low Variance"} · {(vj.entropija * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${vj.razina === "balansirana" ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${(vj.entropija * 100).toFixed(0)}%` }}
                />
              </div>
            </div>
          )}

          {/* ACCA HAZARD */}
          {r.hazard && (
            <div className="flex items-start gap-2 rounded-lg bg-orange-500/10 px-3 py-2 text-[11px] text-orange-300">
              <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{r.hazardPoruka}</span>
            </div>
          )}

          {/* Korelacija iste utakmice */}
          {r.korelacijaUpozorenje && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Više nogu iz iste utakmice — ishodi su povezani, pa je kombinirana vjerojatnost izračunata
                korelacijskim motorom (uzajamno isključivi ishodi → 0). Kelly je automatski smanjen na pola.
              </span>
            </div>
          )}

          {/* Korelacija iste lige / termina */}
          {r.ligaKorelacija && (
            <div className="flex items-start gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-[11px] text-sky-300">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{r.ligaPoruka}</span>
            </div>
          )}

          {/* Nemoguće noge */}
          {r.nemoguceNoge && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>NEMOGUĆ TIKET: sadrži uzajamno isključive noge (npr. 1 i 2 s iste utakmice, Over i Under iste linije). Ukloni jednu od njih.</span>
            </div>
          )}

          {/* Remi/push upozorenje (3+ noge) */}
          {vj.upozorenje && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{vj.upozorenje}</span>
            </div>
          )}

          {/* Frakcijski Kelly preporuka */}
          <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2">
            <span className="font-semibold text-emerald-300">Recommended Stake (Kelly)</span>
            <span className="font-mono font-bold text-emerald-300">
              {r.ulogPerc.toFixed(2)}% bankrolla = {r.ulogIznos.toFixed(2)} €
            </span>
          </div>

          {/* Ulog + potencijalni povrat + LOCK BET */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                Ulog (€)
                <input
                  inputMode="decimal"
                  value={ulog}
                  onChange={(e) => setUlog(e.target.value)}
                  placeholder={r.ulogIznos > 0 ? r.ulogIznos.toFixed(2) : "5"}
                  className="mt-0.5 w-full rounded-lg border border-input bg-background/60 px-2 py-1 text-sm text-foreground"
                />
              </label>
              <div className="text-right text-[11px] text-muted-foreground">
                Potencijalni povrat
                <div className="font-mono text-sm font-bold text-emerald-300">
                  {povrat.toFixed(2)} €
                </div>
              </div>
            </div>
            <button
              onClick={zakljucajListic}
              disabled={locking || r.nemoguceNoge}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {locking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Zaključavam…
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Lock Bet · {r.kvota.toFixed(2)}
                </>
              )}
            </button>
          </div>

          {/* PITAJ LUNU — AI pregled tiketa */}
          <button
            onClick={pitajLunu}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-500/20"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Pitaj Lunu za mišljenje o listiću
          </button>
          {!r.isplativo && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{r.nemoguceNoge ? "Tiket ne može proći — ispravi noge." : "Nema vrijednosti (EV ≤ 0) — preporučam ne igrati ovaj tiket ili ga smanjiti."}</span>
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
              onClick={() => void podijeliListic()}
              className="flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20"
              title="Podijeli tiket (PNG/Web Share)"
              aria-label="Podijeli tiket"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => void preuzmiListic()}
              className="flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300 hover:bg-emerald-500/20"
              title="Preuzmi PNG tiket"
              aria-label="Preuzmi PNG tiket"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Lebdeći gumb — dolje lijevo */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-card shadow-xl shadow-black/40 transition-transform hover:scale-105"
        title="Bet Slip — Tiket Optimizer"
        aria-label="Bet Slip"
      >
        <ShoppingCart className="h-5 w-5 text-emerald-400" />
        {tipovi.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {tipovi.length}
          </span>
        )}
      </button>

      {open && !isMobile && (
        <div className="fixed bottom-20 left-4 z-50 flex max-h-[75vh] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/50">
          {panelSadrzaj}
        </div>
      )}

      {/* Mobilni bottom sheet */}
      {open && isMobile && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl border-t border-border/60 bg-background shadow-2xl shadow-black/60">
            <div className="flex justify-center pt-2">
              <GripHorizontal className="h-5 w-5 text-muted-foreground" />
            </div>
            {panelSadrzaj}
          </div>
        </>
      )}
    </>
  );
}
