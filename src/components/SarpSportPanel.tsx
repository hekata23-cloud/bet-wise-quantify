// ============================================================
// SARPSPORTPANEL.TSX — SARP ploča za Košarku i Rukomet Sharp
// Prikazuje: badgeove (Pace/Fatigue/GK/Rizik remija), projekcije
// s podjelama (1H/1Q ili 1H+HT/FT), trostruku verifikaciju
// (Model vs Monte Carlo vs De-vig tržište), core/alt tip s
// edge guardom (EV ≥ 4.5%) i ¼ Kelly ulogom, povjerenje A/B/C
// s brojem izvora. "+ Korpa" šalje tip u Bet Slip i Dnevnik.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Brain, CheckCircle2, Flame, Gauge, ShieldCheck, ShoppingCart } from "lucide-react";
import { sarpKosarka, type BasketballMatchStats, type BasketballSARPPrediction, type SarpKandidat as KosSarpKandidat } from "@/lib/sarp-kosarka";
import { sarpRukomet, type HandballMatchStats, type HandballSARPPrediction, type SarpKandidat as RukSarpKandidat } from "@/lib/sarp-rukomet";
import type { KosMarkets } from "@/lib/kosarka.functions";
import type { KosAnalysis } from "@/lib/kosarka-engine";
import type { RukometAnalysis } from "@/lib/rukomet-engine";
import { dodajUKorpu, type Sport } from "@/lib/korpa";
import { htftKosarka, htftRukomet, type HtFtKosarkaIzlaz, type HtFtRukometIzlaz } from "@/lib/htft-motor";
import { losaCijena } from "@/lib/devig-shield";
import { zapisiTip, type DnevnikUnos } from "@/lib/dnevnik";
import { spremiKontekstMeca } from "@/lib/ai-context";
import { normalizirajKontekst } from "@/lib/safe-math";

type Utakmica = { id: number; home: string; away: string; league: string; time: string };

type Props =
  | { sport: "kosarka"; utakmica: Utakmica; an: KosAnalysis; mk: KosMarkets | null; book: string | null; brojKladionica?: number | null }
  | { sport: "rukomet"; utakmica: Utakmica; an: RukometAnalysis; book: string | null; brojKladionica?: number | null };

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function Badge({ label, value, dobar }: { label: string; value: string; dobar?: boolean | null }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs font-semibold ${dobar === true ? "text-emerald-400" : dobar === false ? "text-amber-400" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function VrfRed({ ime, p, boja }: { ime: string; p: number | null; boja: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-[10px] text-muted-foreground">{ime}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        {p != null && <div className={`h-full rounded-full ${boja}`} style={{ width: `${Math.min(100, p * 100)}%` }} />}
      </div>
      <span className="w-11 shrink-0 text-right font-mono text-[11px] font-bold">{p != null ? pct(p) : "—"}</span>
    </div>
  );
}

export function SarpSportPanel(props: Props) {
  const { utakmica, book, brojKladionica } = props;
  const isKos = props.sport === "kosarka";
  const [b2bH, setB2bH] = useState(false);
  const [b2bA, setB2bA] = useState(false);
  const [t34H, setT34H] = useState(false);
  const [t34A, setT34A] = useState(false);
  const [suspH, setSuspH] = useState(1);
  const [suspA, setSuspA] = useState(1);
  const [dodano, setDodano] = useState<string | null>(null);

  // UNIVERSAL MATCH CONTEXT (v7)
  const universalKontekst = useMemo(
    () =>
      normalizirajKontekst({
        sport: props.sport,
        fixtureId: utakmica.id,
        domacin: utakmica.home,
        gost: utakmica.away,
        liga: utakmica.league,
        brojKladionica: brojKladionica ?? 0,
      }),
    [props.sport, utakmica.id, utakmica.home, utakmica.away, utakmica.league, brojKladionica],
  );

  const kos = useMemo<BasketballSARPPrediction | null>(() => {
    if (props.sport !== "kosarka") return null;
    const stats: BasketballMatchStats = { homeB2B: b2bH, awayB2B: b2bA, home3in4: t34H, away3in4: t34A };
    return sarpKosarka({
      an: props.an,
      mk: props.mk,
      home: utakmica.home,
      away: utakmica.away,
      league: utakmica.league,
      fixtureId: utakmica.id,
      brojKladionica: brojKladionica ?? undefined,
      stats,
      kontekst: universalKontekst,
    });
  }, [props, b2bH, b2bA, t34H, t34A, utakmica, brojKladionica, universalKontekst]);

  const ruk = useMemo<HandballSARPPrediction | null>(() => {
    if (props.sport !== "rukomet") return null;
    const stats: HandballMatchStats = { suspHome: suspH, suspAway: suspA };
    return sarpRukomet({
      an: props.an,
      home: utakmica.home,
      away: utakmica.away,
      fixtureId: utakmica.id,
      brojKladionica: brojKladionica ?? undefined,
      stats,
      kontekst: universalKontekst,
    });
  }, [props, suspH, suspA, utakmica, brojKladionica, universalKontekst]);

  const htft = useMemo<HtFtKosarkaIzlaz | HtFtRukometIzlaz | null>(() => {
    if (props.sport === "kosarka" && kos) return htftKosarka(kos.expHome, kos.expAway, kos.sigma);
    if (props.sport === "rukomet" && ruk) return htftRukomet(ruk.lamHome, ruk.lamAway, ruk.suspenzije.home, ruk.suspenzije.away);
    return null;
  }, [props.sport, kos, ruk]);

  const pred = isKos ? kos : ruk;

  /* ── AI KONTEKST — SARP košarka/rukomet ide Lunama/Orionu u prompt ── */
  useEffect(() => {
    if (!pred || !pred.core) return;
    spremiKontekstMeca({
      naslov: `${isKos ? "Košarka" : "Rukomet"}: ${utakmica.home} - ${utakmica.away}`,
      liga: utakmica.league,
      vrijeme: utakmica.time,
      kvote: {},
      lambdaDom: isKos ? kos!.expHome : ruk!.lamHome,
      lambdaGost: isKos ? kos!.expAway : ruk!.lamAway,
      lambdaUkupno: isKos ? kos!.expTotal : ruk!.expTotal,
      konsenzus: isKos
        ? { "1": kos!.pML1, "X": kos!.pDraw, "2": kos!.pML2 }
        : { "1": ruk!.pHome, "X": ruk!.pDraw, "2": ruk!.pAway },
      coreTip: {
        label: pred.core.label,
        kljuc: pred.core.tip,
        p: pred.core.p,
        kvota: pred.core.kvota ?? undefined,
        edge: pred.core.edge ?? undefined,
        kellyPct: pred.core.kellyPct,
      },
      altTip: pred.alt
        ? { label: pred.alt.label, p: pred.alt.p, kvota: pred.alt.kvota ?? undefined }
        : null,
      mc: {
        btts: 0,
        o15: 0,
        o25: 0,
        o35: 0,
        p1: isKos ? kos!.mc.pML1 : ruk!.mc.pHome,
        pX: isKos ? kos!.mc.pDraw : ruk!.mc.pDraw,
        p2: isKos ? 1 - kos!.mc.pML1 - kos!.mc.pDraw : ruk!.mc.pAway,
      },
      ocjena: pred.razina,
      povjerenje: pred.povjerenje,
      brojIzvora: pred.izvori.length,
      rizici: pred.upozorenja,
      postave: null,
      live: null,
      kvant: isKos
        ? {
            ot: { p: kos!.ot.p, primijenjeno: kos!.ot.primijenjeno, pomakBodovi: kos!.ot.pomakBodovi },
            blowout: {
              primijenjeno: kos!.blowout.primijenjeno,
              margina: kos!.blowout.margina,
              pomakBodovi: kos!.blowout.pomakBodovi,
            },
          }
        : {
            ht: {
              ekstraGolovi7v6: ruk!.taktika.ekstraGolovi7v6,
              primijenjeno: ruk!.taktika.primijenjeno,
              gkUmorDom: ruk!.taktika.gkUmorDom,
              gkUmorGost: ruk!.taktika.gkUmorGost,
            },
            garbageTime: {
              primijenjeno: ruk!.garbageTime.primijenjeno,
              margina: ruk!.garbageTime.margina,
              minut: ruk!.garbageTime.minut,
              ekstraGolovi: ruk!.garbageTime.ekstraGolovi,
            },
          },
      universal: universalKontekst,
    });
  }, [utakmica.id, pred, universalKontekst, isKos, kos, ruk, utakmica]);

  if (!pred) return null;

  const cijena = pred.core ? losaCijena(pred.core.p, pred.core.kvota) : null;

  function uKorpu(k: KosSarpKandidat | RukSarpKandidat) {
    const sportKorpa: Sport = props.sport === "kosarka" ? "košarka" : "rukomet";
    const sportDnevnik: DnevnikUnos["sport"] = props.sport === "kosarka" ? "kosarka" : "rukomet";
    const id = `${props.sport}|${utakmica.id}|${k.trziste}|${k.tip}`;
    dodajUKorpu({
      id,
      sport: sportKorpa,
      utakmica: `${utakmica.home} - ${utakmica.away}`,
      liga: utakmica.league,
      trziste: k.trziste,
      tip: k.label,
      kvota: k.kvota ?? k.fer,
      vjerojatnost: k.p,
      fixtureId: utakmica.id,
    });
    const provjera =
      k.trziste === "1X2" || k.trziste === "Moneyline"
        ? { vrsta: "1x2" as const, strana: (k.tip === "1" ? "1" : k.tip === "2" ? "2" : "X") as "1" | "X" | "2" }
        : k.trziste === "O/U"
          ? { vrsta: "ou" as const, strana: (k.tip === "Over" ? "over" : "under") as "over" | "under", linija: pred!.linijaTotala }
          : null;
    if (provjera) {
      zapisiTip({
        sport: sportDnevnik,
        kartica: props.sport === "kosarka" ? "kosarka-sarp" : "rukomet-sarp",
        utakmica: `${utakmica.home} — ${utakmica.away}`,
        liga: utakmica.league,
        fixtureId: utakmica.id,
        tip: `${k.label} @ ${(k.kvota ?? k.fer).toFixed(2)}`,
        p: k.p,
        kvota: k.kvota ?? k.fer,
        provjera,
      });
    }
    setDodano(id);
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      {/* ——— NASLOV S POVJERENJEM ——— */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">SARP Engine · {isKos ? "Košarka Sharp" : "Rukomet Sharp"}</span>
          <span className="text-[11px] text-muted-foreground">{book ? `izvor: ${book}` : "analitički model"}</span>
        </div>
        <span className="rounded-full border border-purple-500/50 bg-purple-500/10 px-2.5 py-0.5 text-xs font-bold text-purple-300">
          Model Confidence: {pred.razina} · {pred.povjerenje}/100 ({pred.izvori.length} izvora)
        </span>
      </div>

      {/* ——— BADGE ROW ——— */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {props.sport === "kosarka" && kos ? (
          <>
            <Badge label="Pace Matchup" value={`${kos.pace.tempoOznaka}${kos.pace.expPossessions ? ` · ${kos.pace.expPossessions.toFixed(0)} posj.` : ""}`} dobar={kos.pace.tempoOznaka === "High Pace" ? true : null} />
            <Badge label="Fatigue Index" value={kos.umor.indeks === 0 ? "Odmoreni (0)" : kos.umor.indeks > 0 ? "Domaćin umoran" : "Gost umoran"} dobar={kos.umor.indeks === 0 ? true : false} />
            <Badge label="σ / tempo" value={`razlika ±${kos.sigma.toFixed(1)} · zbroj ±${kos.sigmaTotal.toFixed(1)}`} />
            <Badge label="Four Factors" value={kos.fourFactors.primijenjeno ? `pomak ${kos.fourFactors.pomakMu >= 0 ? "+" : ""}${kos.fourFactors.pomakMu.toFixed(1)}` : "bez statistike"} />
          </>
        ) : ruk ? (
          <>
            <Badge label="Pace / Efikasnost" value={`${ruk.tempo.oznaka} · ${ruk.lamHome.toFixed(1)}–${ruk.lamAway.toFixed(1)}`} />
            <Badge label="GK Differential" value={ruk.gk.procijenjeno ? `bez podataka (liga ${Math.round(ruk.gk.saveHome * 100)}%)` : `dom ${Math.round(ruk.gk.saveHome * 100)}% vs gos ${Math.round(ruk.gk.saveAway * 100)}%`} dobar={ruk.gk.procijenjeno ? null : ruk.gk.diff > 0.01} />
            <Badge label="Isključenja 2'" value={`${ruk.suspenzije.home} vs ${ruk.suspenzije.away}${ruk.suspenzije.utjecajGolova ? ` · utjecaj ${ruk.suspenzije.utjecajGolova >= 0 ? "+" : ""}${ruk.suspenzije.utjecajGolova.toFixed(2)} gola` : ""}`} />
            <Badge label="Rizik remija" value={ruk.pDraw > 0.10 ? `VISOK (${pct(ruk.pDraw)})` : `${pct(ruk.pDraw)}`} dobar={ruk.pDraw > 0.10 ? false : true} />
          </>
        ) : null}
      </div>

      {/* ——— PROJEKCIJE ——— */}
      <div className="mb-3 rounded-lg border border-border bg-card/60 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> Projekcije modela</div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {props.sport === "kosarka" && kos ? (
            <>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">Očekivano dom / gost</div><div className="font-bold tabular-nums">{kos.expHome.toFixed(1)} : {kos.expAway.toFixed(1)}</div></div>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">Zbroj poena</div><div className="font-bold tabular-nums">{kos.expTotal.toFixed(1)} (±{kos.sigmaTotal.toFixed(1)})</div></div>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">1. poluvrijeme</div><div className="font-bold tabular-nums">~{kos.expTotal1H.toFixed(1)} koševa · O{kos.linija1H} {pct(kos.p1HOver)}</div></div>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">1. četvrtina</div><div className="font-bold tabular-nums">~{kos.expTotal1Q.toFixed(1)} koševa · O{kos.linija1Q} {pct(kos.p1QOver)}</div></div>
            </>
          ) : ruk ? (
            <>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">Očekivano golovi</div><div className="font-bold tabular-nums">{ruk.lamHome.toFixed(1)} : {ruk.lamAway.toFixed(1)}</div></div>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">Zbroj golova</div><div className="font-bold tabular-nums">{ruk.expTotal.toFixed(1)} (±{ruk.sigmaTotal.toFixed(1)})</div></div>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">1. poluvrijeme (~47%)</div><div className="font-bold tabular-nums">~{ruk.expTotal1H.toFixed(1)} · O{ruk.linija1H} {pct(ruk.p1HOver)}</div></div>
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-[10px] text-muted-foreground">Najvjerojatniji HT/FT</div><div className="font-bold">{ruk.htft[0]!.kod} ({pct(ruk.htft[0]!.p)})</div></div>
            </>
          ) : null}
        </div>
        {props.sport === "rukomet" && ruk && (
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            {ruk.htft.slice(0, 4).map((h) => <span key={h.kod} className="rounded bg-muted px-1.5 py-0.5 font-semibold">{h.kod} {pct(h.p)}</span>)}
          </div>
        )}
      </div>

      {/* ——— HT/FT PRIJELAZI (PRO) ——— */}
      {htft && (
        <div className="mb-3 rounded-lg border border-indigo-500/40 bg-indigo-500/5 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">⚡ HT/FT prijelazi (Pro model)</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              htft.razinaPreokreta === "visoko" ? "border-red-500/50 bg-red-500/20 text-red-300"
              : htft.razinaPreokreta === "srednje" ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
              : "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"}`}>
              Reverse risk {pct(htft.preokreti)} · {htft.razinaPreokreta}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
            {htft.kombinacije.slice(0, 4).map((k) => (
              <div key={k.kod} className="rounded-lg bg-muted/50 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">{k.label}</div>
                <div className="text-base font-bold text-indigo-200">{k.kod}</div>
                <div className="font-bold tabular-nums text-foreground">{pct(k.p)}</div>
                <div className="text-[9px] text-muted-foreground">fer {k.ferOdd.toFixed(1)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span>HT: dom <b className="text-foreground">{pct(htft.pHTHome)}</b> · remi <b className="text-foreground">{pct(htft.pHTDraw)}</b> · gost <b className="text-foreground">{pct(htft.pHTAway)}</b></span>
            <span>HT vodstvo → FT pobjeda: dom <b className="text-emerald-400">{pct(htft.konverzija.home)}</b> · gost <b className="text-emerald-400">{pct(htft.konverzija.away)}</b></span>
            {props.sport === "kosarka" && <span>1H ~2.5% brži · σ₁p = σ/√2 = {(htft as HtFtKosarkaIzlaz).sigmaHT}</span>}
            {props.sport === "rukomet" && <span>{(htft as HtFtRukometIzlaz).napomena}</span>}
          </div>
        </div>
      )}

      {/* ——— TROSTRUKA VERIFIKACIJA ——— */}
      <div className="mb-3 rounded-lg border border-border bg-card/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Trostruka verifikacija (ML dom)</div>
          {pred.provjera.volatility && (
            <span className="flex items-center gap-1 rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
              <AlertTriangle className="h-3 w-3" /> HIGH VOLATILITY
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <VrfRed ime="1) Analitički model" p={props.sport === "kosarka" ? kos?.pML1 ?? null : ruk?.pHome ?? null} boja="bg-purple-500" />
          <VrfRed ime="2) Monte Carlo 5.000" p={props.sport === "kosarka" ? kos?.mc.pML1 ?? null : ruk?.mc.pHome ?? null} boja="bg-sky-500" />
          <VrfRed ime="3) De-vig tržište" p={props.sport === "kosarka" ? kos?.trziste.pML1 ?? null : ruk?.trziste.pHome ?? null} boja="bg-emerald-500" />
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          {pred.provjera.maxDiscrepancy != null
            ? `Maks. odstupanje model/tržište: ${(pred.provjera.maxDiscrepancy * 100).toFixed(1)} pp ${pred.provjera.volatility ? "> 10 pp — povjerenje spušteno" : "(u granici)"}`
            : "De-vig tržište nije dostupno (nedostaju kvote)."}
          {props.sport === "kosarka" && kos ? ` · MC pOver ${pct(kos.mc.pOver)}` : ruk ? ` · MC pOver ${pct(ruk.mc.pOver)}` : ""}
        </div>
      </div>

      {/* ——— POOR MARKET PRICE ——— */}
      {pred.core && cijena?.losa && (
        <div className="mb-2 rounded-lg border-2 border-red-500/60 bg-red-500/10 p-2.5 text-[11px] font-bold text-red-300">
          🚫 {cijena.poruka}
        </div>
      )}

      {/* ——— CORE TIP ——— */}
      {pred.core ? (
        <div className="mb-2 rounded-lg border-2 border-purple-500/60 bg-purple-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300">SARP glavni tip · {pred.core.trziste}</div>
              <div className="text-lg font-bold">{pred.core.label}</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                Sigurnost {pct(pred.core.p)} · kvota {pred.core.kvota?.toFixed(2) ?? "—"} · fer {pred.core.fer.toFixed(2)}
                {pred.core.edge != null && pred.core.edge >= 0.045 ? (
                  <> · <span className="font-bold text-emerald-400">Value Edge {(pred.core.edge * 100).toFixed(1)}%</span></>
                ) : (
                  <> · Edge ispod guarda 4.5% — samo sigurnost, ne vrijednost</>
                )}
                {pred.core.p < 0.55 && (
                  <> · <span className="font-bold text-amber-400">⚠ VISOKA VARIJANCA — vjerojatnost ispod 55%, ne kao glavna preporuka</span></>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">¼ Kelly ulog</div>
                <div className="font-mono text-lg font-bold text-purple-300">{pred.core.kellyPct.toFixed(2)}%</div>
              </div>
              <button onClick={() => uKorpu(pred.core!)} disabled={dodano === `${props.sport}|${utakmica.id}|${pred.core!.trziste}|${pred.core!.tip}`}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                <ShoppingCart className="h-3.5 w-3.5" /> {dodano ? "Dodano" : "+ Korpa"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> SARP Engine ne nudi tip — kvote nedostaju ili nijedan ishod nema dovoljnu vrijednost. Profesionalno: preskoči utakmicu.
        </div>
      )}

      {/* ——— ALT TIP ——— */}
      {pred.alt && (
        <div className="mb-2 rounded-lg border border-border bg-card/60 p-2.5 text-xs">
          <span className="font-bold uppercase tracking-wider text-muted-foreground">Alternativa: </span>
          {pred.alt.label} · {pct(pred.alt.p)} · kvota {pred.alt.kvota?.toFixed(2) ?? "—"} · ¼ Kelly {pred.alt.kellyPct.toFixed(2)}%
        </div>
      )}

      {/* ——— PREKIDAČI UMORA / ISKLJUČENJA ——— */}
      {props.sport === "kosarka" ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-muted-foreground"><Activity className="mr-1 inline h-3 w-3" />Umor (ručno ako znaš raspored):</span>
          {[
            ["B2B domaćin", b2bH, setB2bH], ["B2B gost", b2bA, setB2bA],
            ["3u4 domaćin", t34H, setT34H], ["3u4 gost", t34A, setT34A],
          ].map(([l, v, set]) => (
            <button key={l as string} onClick={() => (set as (b: boolean) => void)(!(v as boolean))}
              className={`rounded-full border px-2 py-0.5 font-semibold ${v ? "border-amber-500/60 bg-amber-500/20 text-amber-300" : "border-border text-muted-foreground"}`}>
              {l as string} {v ? "−3.0/−2.0 pts" : ""}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-muted-foreground"><Flame className="mr-1 inline h-3 w-3" />Isključenja 2' po timu (0–4, bazno 1):</span>
          <label className="flex items-center gap-1">dom
            <input type="number" min={0} max={4} value={suspH} onChange={(e) => setSuspH(Math.max(0, Math.min(4, Number(e.target.value) || 0)))} className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-center" />
          </label>
          <label className="flex items-center gap-1">gost
            <input type="number" min={0} max={4} value={suspA} onChange={(e) => setSuspA(Math.max(0, Math.min(4, Number(e.target.value) || 0)))} className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-center" />
          </label>
        </div>
      )}

      {/* ——— IZVORI I UPOZORENJA ——— */}
      <div className="flex flex-wrap gap-1 text-[10px]">
        {pred.izvori.map((i) => <span key={i} className="rounded bg-muted px-1.5 py-0.5">{i}</span>)}
      </div>
      {pred.upozorenja.length > 0 && (
        <div className="mt-2 space-y-1">
          {pred.upozorenja.map((w, i) => (
            <div key={i} className={`flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11px] ${w.startsWith("⚠️") ? "bg-red-500/10 text-red-300" : "bg-muted/60 text-muted-foreground"}`}>
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" /> {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

