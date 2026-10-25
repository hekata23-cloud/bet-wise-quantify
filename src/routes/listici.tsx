/* ============================================================
   MOJI LISTIĆI — Virtual Betting Simulation dashboard (v1)
   • Analitička traka: Ukupan ROI %, Win Rate %, Najjači sport,
     Najveća pogođena kvota + "Podijeli Statistiku" (clipboard).
   • Settlement motor: AUTOMATSKA provjera rezultata (API) — pri otvaranju
     stranice i pri povratku na tab, noge se same oboje ✓/✗ kad utakmice
     završe (bez klika); ručna "Provjeri rezultate" ostaje.
     void noge (PST/CANC/ABD) = ⚪ KVOTA 1.00 s dinamičkim
     preračunom kvote i isplate — tiket ne pada zbog voida.
   • Sport-pravila: košarka 1X2/Spread = regularno, Moneyline/Total
     = uklj. OT; rukomet sve na 60'; nogomet sve na 90'.
   • Ručno namještanje noge (✓ / ✗ / ⚪) kad nema automatskog izvora.
   • Konfeta + zvuk na novodobitnim listićima (Efekti dobitka).
   ============================================================ */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, Copy, Layers, RefreshCw, Ticket, Trash2,
  TrendingUp, XCircle, MinusCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  ucitajListice, spremiListic, statistikaListica, statusTiketa, ukupnaKvotaTiketa,
  isplataTiketa, evaluateLegOutcome, pogodiFiksaturu, azurirajListic,
  postaviNoguIshod, brisiListic, noviDobitniTiketi, jeVoidStatus,
  type Tiket, type TiketNoga, type Sport,
} from "@/lib/listici";
import { getStatusUtakmice, getFiksatureDana, type KandidatFiksatura, type StatusUtakmice } from "@/lib/listici.functions";
import { getApiKey } from "@/lib/zlatni-guard";
import { EfektiSwitch, pokreniKonfete, svirajDobitak } from "@/components/DobitakEfekti";
import { kreditirajVirtualniTiket } from "@/lib/virtualna";
import { SettingsModal } from "@/components/SettingsModal";

export const Route = createFileRoute("/listici")({
  head: () => ({
    meta: [{ title: "Moji Listići · Virtual Betting · Precision Check" }],
  }),
  component: ListiciPage,
});

/** sport u API oznaku ("košarka" → "kosarka"). */
function sportApi(s: Sport): "nogomet" | "kosarka" | "rukomet" {
  return s === "košarka" ? "kosarka" : s;
}

/** Auto-provjera na otvaranju stranice — najviše 1× u 5 min da se štedi
 *  dnevni API limit; ručni klik uvijek provjerava odmah. */
const AUTO_KES = "pc.listici.auto.v1";
const AUTO_PAUZA_MS = 5 * 60_000;

function autoPauzaIstekla(): boolean {
  try {
    const proslo = Number(sessionStorage.getItem(AUTO_KES) ?? 0);
    return !Number.isFinite(proslo) || Date.now() - proslo > AUTO_PAUZA_MS;
  } catch {
    return true; // bez session storagea — pokušaj
  }
}

function danIso(d: Date, ofset = 0): string {
  const x = new Date(d.getTime() + ofset * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

const nov = (x: number) => `${x.toFixed(2)} €`;

const STATUS_ZNAK: Record<string, { label: string; cls: string }> = {
  dobitno: {
    label: "POGOĐEN LISTIĆ ✓",
    cls: "bg-emerald-500/25 text-emerald-300 border-emerald-500/60 shadow-sm shadow-emerald-950/40",
  },
  gubitno: {
    label: "PROMAŠEN LISTIĆ ✗",
    cls: "bg-red-500/25 text-red-300 border-red-500/60 shadow-sm shadow-red-950/40",
  },
  povrat: {
    label: "POVRAT ULOGA (VOID)",
    cls: "bg-slate-500/25 text-slate-300 border-slate-500/50",
  },
  aktivno: {
    label: "U TIJEKU · AKTIVAN",
    cls: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  },
};

function StatusBadge({ status }: { status: Tiket["noge"][number]["status"] | string }) {
  if (status === "dobitno") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-500/20 px-3 py-0.5 text-[11px] font-black tracking-wide text-emerald-300 shadow-sm shadow-emerald-950/40">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        POGOĐEN LISTIĆ
      </span>
    );
  }
  if (status === "gubitno") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/60 bg-red-500/20 px-3 py-0.5 text-[11px] font-black tracking-wide text-red-300 shadow-sm shadow-red-950/40">
        <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        PROMAŠEN LISTIĆ
      </span>
    );
  }
  if (status === "povrat") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/50 bg-slate-500/20 px-3 py-0.5 text-[11px] font-black tracking-wide text-slate-300">
        <MinusCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        POVRAT ULOGA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/20 px-3 py-0.5 text-[11px] font-black tracking-wide text-sky-300">
      <RefreshCw className="h-3 w-3 animate-spin text-sky-400" style={{ animationDuration: "3s" }} />
      U TIJEKU
    </span>
  );
}

function LegRow({ t, noga, naNogu }: { t: Tiket; noga: TiketNoga; naNogu: (ishod: "dobitna" | "izgubljena" | "void" | "cekaj") => void }) {
  const voidNoga = noga.status === "void";
  const isDobitna = noga.status === "dobitna";
  const isIzgubljena = noga.status === "izgubljena";
  const isCekaj = noga.status === "cekaj";

  const legTone = isDobitna
    ? "border-emerald-500/50 bg-emerald-950/30 shadow-sm shadow-emerald-950/30"
    : isIzgubljena
      ? "border-red-500/50 bg-red-950/30 shadow-sm shadow-red-950/30"
      : voidNoga
        ? "border-slate-500/30 bg-slate-900/30"
        : "border-border/40 bg-card/40 hover:border-border/70";

  return (
    <li className={`flex flex-col gap-2 rounded-xl border p-3 text-xs transition-colors ${legTone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary border border-primary/25">
            {noga.sport}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {noga.utakmica}
          </span>
        </div>

        {/* Jasna oznaka za svaki par: Zelena kvačica (POGOĐENO) ili Crveni iksić (PROMAŠENO) */}
        <div className="shrink-0 flex items-center gap-1.5">
          {isDobitna && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/70 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-black text-emerald-300 shadow-sm shadow-emerald-950/40">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              POGOĐENO
            </span>
          )}
          {isIzgubljena && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/70 bg-red-500/20 px-2.5 py-0.5 text-[11px] font-black text-red-300 shadow-sm shadow-red-950/40">
              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              PROMAŠENO
            </span>
          )}
          {voidNoga && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/50 bg-slate-500/20 px-2.5 py-0.5 text-[10px] font-bold text-slate-300">
              <MinusCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              VOID (1.00)
            </span>
          )}
          {isCekaj && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              <RefreshCw className="h-3 w-3 animate-spin text-sky-400" style={{ animationDuration: "3s" }} />
              Čeka rezultat…
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span className="text-muted-foreground">{noga.trziste}:</span>
          <span className="font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 rounded">
            {noga.tip}
          </span>
          {noga.liga && <span className="text-[11px] text-muted-foreground">({noga.liga})</span>}
          {noga.napomena && (
            <span className={`text-[11px] font-medium ${isDobitna ? "text-emerald-300" : isIzgubljena ? "text-red-300" : "text-muted-foreground"}`}>
              · {noga.napomena}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1 font-mono">
            <span className="text-[10px] uppercase text-muted-foreground">Kvota:</span>
            <span className={`text-sm font-extrabold ${voidNoga ? "line-through text-slate-500" : isDobitna ? "text-emerald-400" : isIzgubljena ? "text-red-400" : "text-foreground"}`}>
              {noga.kvota.toFixed(2)}
            </span>
            {voidNoga && <span className="text-xs font-bold text-slate-300 font-mono">→ 1.00</span>}
          </div>

          {/* Ručne tipke za provjeru/ispravak para */}
          <div className="flex items-center gap-1 border-l border-border/40 pl-2">
            <button
              onClick={() => naNogu("dobitna")}
              className={`rounded p-1 transition-colors ${isDobitna ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50" : "text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"}`}
              title="Postavi: pogođeno ✓"
              aria-label="Pogođeno"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => naNogu("izgubljena")}
              className={`rounded p-1 transition-colors ${isIzgubljena ? "bg-red-500/30 text-red-300 ring-1 ring-red-500/50" : "text-muted-foreground hover:bg-red-500/10 hover:text-red-400"}`}
              title="Postavi: promašeno ✗"
              aria-label="Promašeno"
            >
              <XCircle className="h-4 w-4" />
            </button>
            <button
              onClick={() => naNogu("void")}
              className={`rounded p-1 transition-colors ${voidNoga ? "bg-slate-500/30 text-slate-300 ring-1 ring-slate-500/50" : "text-muted-foreground hover:bg-slate-500/10 hover:text-slate-300"}`}
              title="Postavi: void ⚪ (kvota 1.00)"
              aria-label="Void"
            >
              <MinusCircle className="h-4 w-4" />
            </button>
            {!isCekaj && (
              <button
                onClick={() => naNogu("cekaj")}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Vrati na 'čeka rezultat'"
                aria-label="Resetiraj"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
      <span className="sr-only">{t.id}</span>
    </li>
  );
}

function ListiciPage() {
  const [tiketi, setTiketi] = useState<Tiket[]>([]);
  const [provjeram, setProveravam] = useState(false);
  const [status, setStatus] = useState("");
  const [settings, setSettings] = useState(false);
  const prvoUcitano = useRef(false);
  const provjeraAktivna = useRef(false);

  const osvjezi = useCallback(() => setTiketi(ucitajListice()), []);
  useEffect(() => { osvjezi(); }, [osvjezi]);

  // Konfeta + zvuk na novodobitnim listićima pri otvaranju stranice
  useEffect(() => {
    if (prvoUcitano.current) return;
    prvoUcitano.current = true;
    const id = setTimeout(() => {
      const novi = noviDobitniTiketi(ucitajListice());
      if (novi.length) { pokreniKonfete(); svirajDobitak(); }
    }, 700);
    return () => clearTimeout(id);
  }, []);

  const stat = statistikaListica(tiketi);

  function podijeliStatistiku() {
    const linije = [
      "MOJI LISTIĆI — statistika",
      `Ukupan ROI: ${stat.roi >= 0 ? "+" : ""}${stat.roi.toFixed(1)}%`,
      `Win Rate: ${stat.winRate.toFixed(1)}% (${stat.dobitni}/${stat.odigrani} listića)`,
      `Ulog: ${nov(stat.ukupanUlog)} · Dobitak: ${nov(stat.ukupanDobitak)} · Profit: ${stat.profit >= 0 ? "+" : ""}${nov(stat.profit)}`,
      `Najjači sport: ${stat.najjaciSport ?? "—"}${stat.najjaciSport ? ` (${stat.najjaciSportProfit >= 0 ? "+" : ""}${nov(stat.najjaciSportProfit)})` : ""}`,
      `Najveća pogođena kvota: ${stat.najvecaKvota != null ? stat.najvecaKvota.toFixed(2) : "—"}`,
    ].join("\n");
    void navigator.clipboard
      .writeText(linije)
      .then(() => toast.success("Statistika kopirana u međuspremnik"))
      .catch(() => toast.error("Kopiranje nije uspjelo"));
  }

  /** Automatsko poravnanje: API provjera svih nogu koje čekaju. */
  const provjeri = useCallback(async () => {
    if (provjeraAktivna.current) return;
    provjeraAktivna.current = true;
    // Ključ nije nužan u browseru — server funkcije imaju env fallback;
    // ako ništa ne valja, ACCOUNT greška ispod otvara Postavke.
    const apiKey = getApiKey() ?? "";
    setProveravam(true);
    setStatus("Provjeravam listiće kroz API red…");
    const danKes = new Map<string, KandidatFiksatura[]>();
    const statusKes = new Map<string, StatusUtakmice>(); // ista utakmica = 1 API poziv
    let pozivi = 0;
    let poravnateNoge = 0;
    // API red ostaje u granicama; s de-duplikacijom pokriva i listiće
    // s više nogu na istoj utakmici.
    const MAX_POZIVA = 24;
    let limitPauza = false;
    let accountStop = false;
    try {
      const svi = ucitajListice();
      for (const t of svi) {
        if (limitPauza || pozivi >= MAX_POZIVA) break;
        if (statusTiketa(t.noge) !== "aktivno") continue;
        let promijenjen = false;
        for (const n of t.noge) {
          if (limitPauza || pozivi >= MAX_POZIVA) break;
          if (n.status !== "cekaj") continue;
          const sport = sportApi(n.sport);
          let fid = n.fixtureId;
          if (fid == null) {
            // uparivanje po imenima: dan listića ±1 dan (keširano po danu)
            const baza = new Date(t.datum);
            for (const ofset of [0, 1, -1]) {
              if (limitPauza || pozivi >= MAX_POZIVA) break;
              const dan = danIso(baza, ofset);
              const ck = `${sport}|${dan}`;
              let kandidati = danKes.get(ck);
              if (!kandidati) {
                const r = await getFiksatureDana({ data: { sport, dan, apiKey } });
                pozivi++;
                if (r.error && /DNEVNI_LIMIT|ACCOUNT|RATE_LIMIT/.test(r.error)) {
                  if (/ACCOUNT/.test(r.error)) accountStop = true;
                  limitPauza = true;
                  break;
                }
                kandidati = r.error ? [] : r.fiksature;
                danKes.set(ck, kandidati);
              }
              const id = pogodiFiksaturu(n.utakmica, kandidati);
              if (id != null) { fid = id; n.fixtureId = id; promijenjen = true; break; }
            }
          }
          if (fid == null) continue;
          const ck = `${sport}|${fid}`;
          let r = statusKes.get(ck);
          if (!r) {
            r = await getStatusUtakmice({ data: { sport, fixtureId: fid, apiKey } });
            statusKes.set(ck, r);
            pozivi++;
          }
          if (r.error && /DNEVNI_LIMIT|ACCOUNT|RATE_LIMIT/.test(r.error)) {
            if (/ACCOUNT/.test(r.error)) accountStop = true;
            limitPauza = true;
            break;
          }
          if (r.error || (!r.zavrsena && !jeVoidStatus(r.status))) continue;
          const ishod = evaluateLegOutcome(n.trziste, n.tip, r, n.sport);
          if (ishod === "nepoznato") continue;
          n.status = ishod === "dobitna" ? "dobitna" : ishod === "izgubljena" ? "izgubljena" : "void";
          poravnateNoge++;
          n.napomena = jeVoidStatus(r.status)
            ? `${r.status} — odgođeno/otkazano, kvota 1.00`
            : ishod === "povrat"
              ? "PUSH — povrat uloga na nozi"
              : `Završeno ${r.domReg ?? r.dom ?? "?"}:${r.gostReg ?? r.gost ?? "?"} (${ishod === "dobitna" ? "Pogođeno" : "Promašeno"})`;
          promijenjen = true;
        }
        if (promijenjen) azurirajListic(t);
      }
    } catch { /* mreža — javi ispod */ }
    kreditirajVirtualne();
    osvjezi();
    const novi = noviDobitniTiketi(ucitajListice());
    if (novi.length) {
      pokreniKonfete();
      svirajDobitak();
      toast.success(`${novi.length} novi dobitan listić! 🎉`);
    }
    try { sessionStorage.setItem(AUTO_KES, String(Date.now())); } catch { /* bez session storagea */ }
    if (accountStop && !apiKey) {
      setStatus("Unesi API-Sports ključ u Postavkama (⚙️) — provjera rezultata ga treba.");
      setSettings(true);
    } else {
      setStatus(
        limitPauza
          ? "API limit dostignut — nastavi malo kasnije (ostatak se ne troši uzalud)."
          : pozivi === 0
            ? "Nema nogu za provjeru (sve su već poravnate ili bez izvora)."
            : `Provjereno ${pozivi} poziva kroz API red.`,
      );
    }
    if (poravnateNoge > 0) {
      toast.success(`Provjera završena: poravnato ${poravnateNoge} nog${poravnateNoge === 1 ? "a" : "u"}.`);
    }
    setProveravam(false);
    provjeraAktivna.current = false;
  }, [osvjezi]);

  /** Automatska provjera pri otvaranju stranice — noge se same oboje ✓/✗
   *  čim utakmice završe (bez klika na "Provjeri rezultate"). */
  const autoRef = useRef(false);
  useEffect(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    const imaCekaj = ucitajListice().some((t) => statusTiketa(t.noge) === "aktivno");
    if (imaCekaj && autoPauzaIstekla()) void provjeri();
  }, [provjeri]);

  /** Automatska ponovna provjera kad se korisnik vrati na tab (utakmice
   *  mogle završiti dok je stranica bila otvorena u pozadini). */
  useEffect(() => {
    const naPovratak = () => {
      if (document.visibilityState !== "visible") return;
      const imaCekaj = ucitajListice().some((t) => statusTiketa(t.noge) === "aktivno");
      if (imaCekaj && autoPauzaIstekla()) void provjeri();
    };
    document.addEventListener("visibilitychange", naPovratak);
    return () => document.removeEventListener("visibilitychange", naPovratak);
  }, [provjeri]);

  /** Tiha provjera dok je stranica otvorena; pauza od 5 minuta čuva API kvotu. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const imaCekaj = ucitajListice().some((t) => statusTiketa(t.noge) === "aktivno");
      if (imaCekaj && autoPauzaIstekla()) void provjeri();
    }, AUTO_PAUZA_MS);
    return () => window.clearInterval(timer);
  }, [provjeri]);

  /** Kreditiraj poravnate virtualne listiće na bankroll (idempotentno). */
  function kreditirajVirtualne() {
    for (const t of ucitajListice()) {
      const t2 = kreditirajVirtualniTiket(t);
      if (t2 !== t) azurirajListic(t2);
    }
  }

  function naNogu(tiketId: string, nogaId: string, ishod: "dobitna" | "izgubljena" | "void" | "cekaj") {
    if (ishod === "cekaj") {
      const svi = ucitajListice();
      const t = svi.find((x) => x.id === tiketId);
      const n = t?.noge.find((x) => x.id === nogaId);
      if (t && n) {
        n.status = "cekaj";
        n.napomena = undefined;
        azurirajListic(t);
      }
    } else {
      const ishodNoge = ishod === "void" ? "povrat" : ishod;
      postaviNoguIshod(tiketId, nogaId, ishodNoge, ishod === "void" ? "Ručno void — kvota 1.00" : "Ručno ✓/✗");
    }
    kreditirajVirtualne();
    osvjezi();
  }

  const imaAktivnih = tiketi.some((t) => statusTiketa(t.noge) === "aktivno");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--gradient-primary)" }}>
            <Ticket className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Moji Listići</h1>
            <p className="text-sm text-muted-foreground">
              Virtualni tiketi, isplate po sport-pravilima i void zaštita (kvota 1.00).
            </p>
          </div>
        </div>
        <EfektiSwitch />
      </header>

      {/* ANALITIČKA TRAKA */}
      <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-emerald-400" /> Analitika virtualnog igrača
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatKarta label="Ukupan ROI" vrednost={`${stat.roi >= 0 ? "+" : ""}${stat.roi.toFixed(1)}%`} dobro={stat.roi >= 0} />
          <StatKarta label="Win Rate" vrednost={`${stat.winRate.toFixed(1)}%`} pod={`${stat.dobitni}/${stat.odigrani} listića`} dobro={stat.winRate >= 50} />
          <StatKarta
            label="Najjači sport"
            vrednost={stat.najjaciSport ?? "—"}
            pod={stat.najjaciSport ? `${stat.najjaciSportProfit >= 0 ? "+" : ""}${nov(stat.najjaciSportProfit)}` : "bez podataka"}
            dobro={stat.najjaciSportProfit > 0}
          />
          <StatKarta
            label="Najveća pogođena kvota"
            vrednost={stat.najvecaKvota != null ? stat.najvecaKvota.toFixed(2) : "—"}
            pod={`${stat.aktivni} aktivnih`}
            dobro={stat.najvecaKvota != null}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Ulog {nov(stat.ukupanUlog)}</span>
          <span>·</span>
          <span>Dobitak {nov(stat.ukupanDobitak)}</span>
          <span>·</span>
          <span className={stat.profit >= 0 ? "text-emerald-400" : "text-red-400"}>
            Profit {stat.profit >= 0 ? "+" : ""}{nov(stat.profit)}
          </span>
          <button
            onClick={podijeliStatistiku}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            <Copy className="h-3.5 w-3.5" /> Podijeli Statistiku
          </button>
        </div>
      </section>

      {/* TRAKA ZA PROVJERU */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void provjeri()}
            disabled={provjeram}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${provjeram ? "animate-spin" : ""}`} />
            {provjeram ? "Provjeravam…" : "🔄 Osvježi i provjeri rezultate"}
          </button>
          {imaAktivnih && !provjeram && (
            <span className="text-xs text-muted-foreground">
              Aktivni listići čekaju poravnanje — void noge (PST/CANC/ABD) automatski dobivaju kvotu 1.00.
            </span>
          )}
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              spremiListic(
                [
                  {
                    id: `noga-${Date.now()}-1`,
                    sport: "nogomet",
                    utakmica: "Real Madrid — Barcelona",
                    liga: "La Liga",
                    trziste: "1X2",
                    tip: "1",
                    kvota: 1.95,
                    vjerojatnost: 0.58,
                    status: "dobitna",
                    napomena: "Završeno 2:1 (Pogođeno ✓)",
                  },
                  {
                    id: `noga-${Date.now()}-2`,
                    sport: "nogomet",
                    utakmica: "Arsenal — Chelsea",
                    liga: "Premier League",
                    trziste: "O/U 2.5",
                    tip: "Over 2.5",
                    kvota: 1.80,
                    vjerojatnost: 0.62,
                    status: "dobitna",
                    napomena: "Završeno 3:1 (Pogođeno ✓)",
                  },
                ],
                10,
              );
              osvjezi();
              toast.success("Dodan probni pogođeni listić! 🎉");
            }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
            title="Dodaj ogledni pogođeni listić za testiranje"
          >
            + Probni pogođeni ✓
          </button>
          <button
            onClick={() => {
              spremiListic(
                [
                  {
                    id: `noga-${Date.now()}-1`,
                    sport: "nogomet",
                    utakmica: "Bayern Munich — Dortmund",
                    liga: "Bundesliga",
                    trziste: "1X2",
                    tip: "1",
                    kvota: 1.65,
                    vjerojatnost: 0.65,
                    status: "dobitna",
                    napomena: "Završeno 3:0 (Pogođeno ✓)",
                  },
                  {
                    id: `noga-${Date.now()}-2`,
                    sport: "košarka",
                    utakmica: "Partizan — Crvena Zvezda",
                    liga: "Euroliga",
                    trziste: "Moneyline",
                    tip: "1",
                    kvota: 1.90,
                    vjerojatnost: 0.55,
                    status: "izgubljena",
                    napomena: "Završeno 78:82 (Promašeno ✗)",
                  },
                ],
                10,
              );
              osvjezi();
              toast.info("Dodan probni promašeni listić!");
            }}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20"
            title="Dodaj ogledni promašeni listić za testiranje"
          >
            + Probni promašeni ✗
          </button>
        </div>
      </div>

      {/* LISTIĆI */}
      {tiketi.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
          Još nema listića. Sastavi tiket u <b className="text-emerald-400">Korpi</b>, unesi ulog i klikni
          "Odigraj" — listić se sprema ovdje i prati mu se isplata.
        </div>
      ) : (
        <div className="space-y-4">
          {tiketi.map((t) => {
            const st = statusTiketa(t.noge);
            const kvota = ukupnaKvotaTiketa(t.noge);
            const isplata = isplataTiketa(t.noge, t.ulog);
            const isDobitan = st === "dobitno";
            const isPromasen = st === "gubitno";

            const cardTone = isDobitan
              ? "border-2 border-emerald-500/70 bg-gradient-to-b from-card/95 via-emerald-950/25 to-card/95 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500/40"
              : isPromasen
                ? "border-2 border-red-500/70 bg-gradient-to-b from-card/95 via-red-950/25 to-card/95 shadow-xl shadow-red-950/40 ring-1 ring-red-500/40"
                : "border border-border/60 bg-card/50";

            return (
              <article key={t.id} className={`rounded-2xl p-4 transition-all ${cardTone}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={st} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.datum).toLocaleDateString("hr-HR")} · {t.noge.length} {t.noge.length === 1 ? "par" : "para"}
                    </span>
                  </div>
                  <button
                    onClick={() => { brisiListic(t.id); osvjezi(); toast.success("Listić obrisan"); }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    title="Obriši listić"
                    aria-label="Obriši listić"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Popis parova sa zelenim kvačicama i crvenim iksićima */}
                <ul className="space-y-2 mt-3">
                  {t.noge.map((n) => (
                    <LegRow key={n.id} t={t} noga={n} naNogu={(ishod) => naNogu(t.id, n.id, ishod)} />
                  ))}
                </ul>

                {/* Veliki uočljivi status banneri za pogođeni ili promašeni listić */}
                {isDobitan && (
                  <div className="mt-3.5 flex items-center justify-between rounded-xl border-2 border-emerald-500/70 bg-gradient-to-r from-emerald-950/90 via-emerald-900/50 to-emerald-950/90 px-4 py-3 text-emerald-300 shadow-md shadow-emerald-950/50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/25 text-emerald-300 border border-emerald-500/60 shadow-sm">
                        <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-base font-black tracking-wide uppercase text-emerald-300 flex items-center gap-2">
                          POGOĐEN LISTIĆ ✓
                        </div>
                        <div className="text-xs text-emerald-400/90 font-medium">
                          Svi parovi na listiću su uspješno pogođeni!
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400/70">Ukupna Isplata</div>
                      <div className="text-xl font-black font-mono text-emerald-300">{nov(isplata)} 🎉</div>
                    </div>
                  </div>
                )}

                {isPromasen && (
                  <div className="mt-3.5 flex items-center justify-between rounded-xl border-2 border-red-500/70 bg-gradient-to-r from-red-950/90 via-red-900/50 to-red-950/90 px-4 py-3 text-red-300 shadow-md shadow-red-950/50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/25 text-red-300 border border-red-500/60 shadow-sm">
                        <XCircle className="h-6 w-6 text-red-400" />
                      </div>
                      <div>
                        <div className="text-base font-black tracking-wide uppercase text-red-300 flex items-center gap-2">
                          PROMAŠEN LISTIĆ ✗
                        </div>
                        <div className="text-xs text-red-400/90 font-medium">
                          Nažalost, listić nije prošao · Isplata: 0,00 €
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-red-400/70">Izgubljen ulog</div>
                      <div className="text-lg font-bold font-mono text-red-400">-{nov(t.ulog)}</div>
                    </div>
                  </div>
                )}

                {st === "povrat" && (
                  <div className="mt-3.5 flex items-center justify-between rounded-xl border border-slate-500/50 bg-slate-900/60 px-4 py-2.5 text-slate-300">
                    <div className="flex items-center gap-2">
                      <MinusCircle className="h-5 w-5 text-slate-400" />
                      <span className="font-bold">POVRAT ULOGA (Svi parovi void / otkazani)</span>
                    </div>
                    <span className="font-mono font-bold text-slate-200">{nov(isplata)}</span>
                  </div>
                )}

                {st === "aktivno" && (
                  <div className="mt-3.5 flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-950/20 px-3.5 py-2 text-sky-300 text-xs">
                    <div className="flex items-center gap-2 font-medium">
                      <RefreshCw className="h-4 w-4 animate-spin text-sky-400" style={{ animationDuration: "3s" }} />
                      <span>LISTIĆ U TIJEKU — Čeka se završetak utakmica</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-1.5">Mogući dobitak:</span>
                      <b className="font-mono text-emerald-400 font-bold">{nov(t.ulog * kvota)}</b>
                    </div>
                  </div>
                )}

                <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/40 pt-2.5 text-xs">
                  <span className="text-muted-foreground">
                    Ukupna kvota: <b className="font-mono text-foreground">{kvota.toFixed(2)}</b>
                  </span>
                  <span className="text-muted-foreground">Ulog: <b className="font-mono text-foreground">{nov(t.ulog)}</b></span>
                  {st === "aktivno" ? (
                    <span className="text-muted-foreground ml-auto">
                      Potencijalna isplata: <b className="font-mono text-emerald-400 font-bold">{nov(t.ulog * kvota)}</b>
                    </span>
                  ) : isDobitan ? (
                    <span className="font-bold text-emerald-300 ml-auto">Dobitak: {nov(isplata)} 🎉</span>
                  ) : st === "povrat" ? (
                    <span className="font-semibold text-slate-300 ml-auto">Povrat: {nov(isplata)}</span>
                  ) : (
                    <span className="font-semibold text-red-400 ml-auto">Gubitak: {nov(t.ulog)}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Layers className="h-3.5 w-3.5" /> Noge bez API identifikatora poravnaj ručno (✓/✗/⚪). Košarka:
        1X2 i Spread na regularno vrijeme, Moneyline i Total uklj. produžetak. Rukomet: sve na 60 min.
        Nogomet: sve na 90 min + nadoknada.
      </p>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function StatKarta({ label, vrednost, pod, dobro }: { label: string; vrednost: string; pod?: string; dobro?: boolean }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${dobro === true ? "text-emerald-400" : dobro === false ? "text-red-400" : "text-foreground"}`}>
        {vrednost}
      </div>
      {pod && <div className="text-[10px] text-muted-foreground">{pod}</div>}
    </div>
  );
}
