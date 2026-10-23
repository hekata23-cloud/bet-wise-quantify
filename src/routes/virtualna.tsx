/* ============================================================
   VIRTUALNA KLADIONICA — Virtual Sportsbook (v1)
   • Bankroll: virtuelni euri, start €10.000, "Dodaj još eura" + "Reset"
     — praktički neograničeno, uz dnevnik transakcija.
   • Listić do 30 nogu preko nogomet + košarka + rukomet istovremeno;
     ukupna kvota = umnožak; moguća isplata = ulog × kvota; gubitak €0.00.
   • Tržišta SuperSport stila: 1X2, Dvostruka šansa, O/U 0.5–3.5,
     BTTS, DNB, HT/FT (nogomet); Moneyline uklj. OT, Regularno 1X2,
     AH, Total poena (košarka); 1X2 60', AH, Totali, 1. poluvrijeme (rukomet).
   • Kvote: API-Sports kad su dostupne (batch po danu, keš 12 h),
     inače deterministički "virtualni" model (marža 5,5%, ista utakmica
     = iste kvote). Odabir klik gumba — klik opet briše s listića.
   • Vrijeme isključivo Europe/Zagreb: "DD.MM.YYYY. HH:mm".
   • Poravnanje: "Uplati" sprema tiket u postojeće "Moji listići"
     (settlement motor: void 1.00, sport-pravila) i debita bankroll;
     dobitak se automatski kreditira kad listić poravna.
   • ORION AI Analiza Listića: kombinirana vjerojatnost, najveći
     rizik, Kelly ulog — analizira bilo koju kombinaciju sportova.
   ============================================================ */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Coins, Euro, Plus, RefreshCw, RotateCcw, ScanEye, Ticket, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { getFiksatureDana, type KandidatFiksatura } from "@/lib/listici.functions";
import { getKvoteDana, type KvoteOpcija } from "@/lib/virtualna.functions";
import { getApiKey } from "@/lib/zlatni-guard";
import { isoDateZagreb } from "@/lib/zagreb-time";
import {
  analizirajSlip, bankroll as citajBankroll, danasZagreb, dodajEure, dodajNaSlip,
  formatZagrebIzUlaza, jeNaSlipu, MAX_NOGU, mogucaIsplata, ocistiSlip, POCETNI_BANKROLL,
  resetBankroll, skiniUlog, transakcije, trzistaZaSport, ukupnaKvotaSlipa,
  uplatiVirtualniListic, ukloniSSlipa, ucitajSlip, virtualneKvote, type PonudaTrzista,
  type SlipNoga, type Sport,
} from "@/lib/virtualna";
import { spremiKontekstTiketa } from "@/lib/ai-context";
import { SettingsModal } from "@/components/SettingsModal";

export const Route = createFileRoute("/virtualna")({
  head: () => ({
    meta: [{ title: "Virtualna Kladionica · Precision Check" }],
  }),
  component: VirtualnaStranica,
});

const SPORTOVI: Array<{ s: Sport; label: string }> = [
  { s: "nogomet", label: "Nogomet" },
  { s: "košarka", label: "Košarka" },
  { s: "rukomet", label: "Rukomet" },
];

const BRZI_ULOZI = [1, 10, 100, 500];

const eur = (n: number) =>
  new Intl.NumberFormat("hr-HR", { style: "currency", currency: "EUR" }).format(n);

function sportApi(s: Sport): "nogomet" | "kosarka" | "rukomet" {
  return s === "košarka" ? "kosarka" : s;
}

/** Merge "model" kvota s API kvotama: API pobjeđuje po (trziste,tip). */
function ponudeZaFiksaturu(sport: Sport, f: KandidatFiksatura, apiOpcije: KvoteOpcija[] | undefined) {
  const model = virtualneKvote(sport, f.id);
  if (!apiOpcije || apiOpcije.length === 0) return model;
  const apiMapa = new Map(apiOpcije.map((o) => [`${o.trziste}|${o.tip}`, o]));
  return model.map((o) => {
    const api = apiMapa.get(`${o.trziste}|${o.tip}`);
    if (!api || !(api.kvota > 1)) return o;
    return { ...o, kvota: api.kvota, vjerojatnost: 1 / api.kvota, izvorKvote: "api" as const };
  });
}

function VirtualnaStranica() {
  const [sport, setSport] = useState<Sport>("nogomet");
  const [dan, setDan] = useState(() => (typeof window !== "undefined" ? isoDateZagreb() : danasZagreb()));
  const [fiksature, setFiksature] = useState<KandidatFiksatura[]>([]);
  const [apiKvote, setApiKvote] = useState<Record<number, KvoteOpcija[]>>({});
  const [apiKvotaInfo, setApiKvotaInfo] = useState<"nema" | "ima" | "greska">("nema");
  const [ucitavam, setUcitavam] = useState(false);
  const [slip, setSlip] = useState<SlipNoga[]>([]);
  const [balans, setBalans] = useState(POCETNI_BANKROLL);
  const [ulogUnos, setUlogUnos] = useState("10");
  const [postavke, setPostavke] = useState(false);

  // SSR-safe load
  useEffect(() => {
    setSlip(ucitajSlip());
    setBalans(citajBankroll());
  }, []);

  const apiKey = getApiKey();

  // Učitaj utakmice + kvote (batch po danu, keš na serveru)
  useEffect(() => {
    let mrtav = false;
    (async () => {
      setUcitavam(true);
      const fRes = await getFiksatureDana({ data: { sport: sportApi(sport), dan, apiKey } });
      if (mrtav) return;
      setFiksature(fRes.fiksature ?? []);
      if (!apiKey) { setApiKvote({}); setApiKvotaInfo("nema"); setUcitavam(false); return; }
      const kRes = await getKvoteDana({ data: { sport: sportApi(sport), dan, apiKey } });
      if (mrtav) return;
      if (kRes.error) { setApiKvote({}); setApiKvotaInfo("greska"); }
      else {
        const mapa: Record<number, KvoteOpcija[]> = {};
        for (const u of kRes.utakmice) mapa[u.fixtureId] = u.opcije;
        setApiKvote(mapa);
        setApiKvotaInfo(Object.keys(mapa).length > 0 ? "ima" : "nema");
      }
      setUcitavam(false);
    })();
    return () => { mrtav = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, dan]);

  const ponudeByFixture = useMemo(() => {
    const mapa: Record<number, ReturnType<typeof ponudeZaFiksaturu>> = {};
    for (const f of fiksature) mapa[f.id] = ponudeZaFiksaturu(sport, f, apiKvote[f.id]);
    return mapa;
  }, [fiksature, sport, apiKvote]);

  const grupaTrzista = useMemo(() => {
    const videne: string[] = [];
    for (const p of trzistaZaSport(sport)) if (!videne.includes(p.grupa)) videne.push(p.grupa);
    return videne;
  }, [sport]);

  const odabrane = new Set(slip.map((n) => `${n.fixtureId ?? 0}|${n.trziste}|${n.tip}`));
  const ulog = Number(ulogUnos.replace(",", ".")) || 0;
  const ukupnaKvota = ukupnaKvotaSlipa(slip);
  const analiza = analizirajSlip(slip, balans);

  function toggle(sportS: Sport, f: KandidatFiksatura, p: { trziste: string; tip: string; label: string; kvota: number; vjerojatnost: number; izvorKvote: "api" | "model" }) {
    const kljuc = `${f.id ?? 0}|${p.trziste}|${p.tip}`;
    if (odabrane.has(kljuc)) {
      const noga = slip.find((n) => `${n.fixtureId ?? 0}|${n.trziste}|${n.tip}` === kljuc);
      if (noga) ukloniSSlipa(noga.id);
      setSlip(ucitajSlip());
      return;
    }
    const r = dodajNaSlip({
      id: `f${f.id}-${p.trziste.replace(/\s/g, "")}-${p.tip.replace(/\s/g, "")}`,
      sport: sportS, fixtureId: f.id, utakmica: `${f.dom} - ${f.gost}`,
      trziste: p.trziste, tip: p.tip, label: p.label,
      kvota: p.kvota, vjerojatnost: p.vjerojatnost, izvorKvote: p.izvorKvote,
      datum: f.vrijeme ?? undefined,
    });
    if (!r.ok) { toast.warning(r.razlog ?? "Odabir nije dodan."); return; }
    setSlip(ucitajSlip());
  }

  function uplati() {
    const r = uplatiVirtualniListic(slip, ulog);
    if (!r.ok) { toast.error(r.razlog); return; }
    setBalans(r.novoStanje);
    setSlip([]);
    toast.success(`Listić uplaćen — ${r.tiket.noge.length} noga, potencijalni dobitak ${eur(mogucaIsplata(ulog, r.tiket.noge))}`);
  }

  function orionAnaliza() {
    if (slip.length === 0) { toast.warning("Listić je prazan."); return; }
    // Kontekst tiketa (isti blok koji Luna/Orion čitaju)
    const exclusivne = new Set<string>();
    let nemoguce = false;
    for (const n of slip) {
      const k = `${n.fixtureId ?? n.utakmica}|${n.trziste}`;
      if (exclusivne.has(k) && /^(1|X|2)$/.test(n.tip)) nemoguce = true;
      exclusivne.add(k);
    }
    const korelacija = new Set(slip.map((n) => n.fixtureId ?? n.utakmica)).size < slip.length;
    spremiKontekstTiketa({
      brojNoga: slip.length,
      kvota: ukupnaKvota,
      vjerojatnost: analiza.kombiniranaVjerojatnost,
      edge: analiza.kombiniranaVjerojatnost * ukupnaKvota - 1,
      korelacijaUpozorenje: korelacija,
      nemoguceNoge: nemoguce,
      varijanca: {
        razina: analiza.kombiniranaVjerojatnost < 0.03 ? "High" : analiza.kombiniranaVjerojatnost < 0.15 ? "Balanced" : "Low",
        entropija: slip.length > 0 ? -slip.reduce((s, n) => s + (n.vjerojatnost > 0 ? n.vjerojatnost * Math.log(n.vjerojatnost) : 0), 0) / Math.log(slip.length) : 0,
        remiPushNoge: slip.filter((n) => n.tip === "X" || n.tip.includes("DNB") || (/\b[0-9]+(?:\.0)?$/.test(n.tip) && !/\.[15]$/.test(n.tip))).length,
        upozorenje: nemoguce ? "UPOZORENJE: dvije noge iste utakmice/tržišta su uzajamno isključive." : null,
      },
      noge: slip.map((n) => ({ utakmica: n.utakmica, trziste: n.trziste, tip: n.tip, kvota: n.kvota, p: n.vjerojatnost })),
    });
    const pitanje =
      `ORION — ANALIZA VIRTUALNOG LISTIĆA (podaci u kontekstu tiketa). Listić ima ${slip.length} nogu ` +
      `(max ${MAX_NOGU}), ukupna kvota ${ukupnaKvota.toFixed(2)}, kombinirana vjerojatnost ${(analiza.kombiniranaVjerojatnost * 100).toFixed(2)}%, ` +
      `potencijalna isplata ${eur(mogucaIsplata(ulog, slip))} uz ulog ${eur(ulog)}. ` +
      `NAJVEĆI RIZIK: ${analiza.najveciRizik ? `${analiza.najveciRizik.utakmica} — ${analiza.najveciRizik.tip} @${analiza.najveciRizik.kvota.toFixed(2)} (p=${(analiza.rizikVjerojatnost * 100).toFixed(1)}%)` : "n/a"}. ` +
      `Kelly: puni ${(analiza.kellyUdio * 100).toFixed(2)}% bankrolla, 1/4 Kelly preporuka ${eur(analiza.preporuceniUlog)} (bankroll ${eur(balans)}). ` +
      `Daj: 1) realnu ocjenu prolaza uz maržu kvota, 2) provjeru najvećeg rizika i korelacija između nogu, ` +
      `3) konačan sud: igraj ili preskoči, s preporučenim ulogom.`;
    try {
      window.localStorage.setItem("pc.orion.pitanje", pitanje);
      window.dispatchEvent(new CustomEvent("andromeda:orion-pitanje"));
    } catch { /* ignoriraj */ }
    toast.success("Orion analizira listić — otvara se panel.");
  }

  return (
    <div className="mx-auto max-w-7xl px-3 pb-24 pt-4 sm:px-5">
      {/* ── Zaglavlje + bankroll ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">VIRTUALNA KLADIONICA</h1>
            <p className="text-[11px] text-muted-foreground">Virtuelni euri · do {MAX_NOGU} nogu · settlement na stvarne rezultate</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <Euro className="h-4 w-4 text-amber-400" />
          <div className="text-lg font-bold tabular-nums text-amber-300">{eur(balans)}</div>
          <button
            onClick={() => { setBalans(dodajEure(1000, "Dodano +€1.000")); toast.success("Dodano €1.000"); }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20"
            title="Dodaj još eura"
          >
            <Plus className="mr-0.5 inline h-3 w-3" />€1.000
          </button>
          <button
            onClick={() => { setBalans(dodajEure(5000, "Dodano +€5.000")); toast.success("Dodano €5.000"); }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20"
          >
            +€5.000
          </button>
          <button
            onClick={() => { setBalans(resetBankroll()); toast.info("Bankroll resetiran na €10.000,00"); }}
            className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            title="Reset balance"
          >
            <RotateCcw className="mr-0.5 inline h-3 w-3" />Reset
          </button>
        </div>
      </div>

      {/* ── Sportovi + dan ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SPORTOVI.map(({ s, label }) => (
          <button
            key={s}
            onClick={() => setSport(s)}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold transition ${
              sport === s ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="date"
          value={dan}
          onChange={(e) => e.target.value && setDan(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">sve vrijeme: Europe/Zagreb</span>
        {apiKey ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> API AKTIVAN
          </span>
        ) : (
          <button onClick={() => setPostavke(true)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/20">
            API KLJUČ NIJE POSTAVLJEN → Postavke
          </button>
        )}
        <button onClick={() => setDan(danasZagreb())} className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-secondary px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3 w-3 ${ucitavam ? "animate-spin" : ""}`} /> Danas
        </button>
      </div>

      {apiKvotaInfo === "greska" && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          API kvote nisu dostupne (plan bez odds pristupa ili greška) — koriste se virtualne kvote modela (marža 5,5%).
        </p>
      )}
      {apiKvotaInfo === "nema" && apiKey && (
        <p className="mb-3 text-[11px] text-muted-foreground">Kvote: virtualni model (deterministički, marža 5,5%). API kvote za ovaj dan nisu dostupne.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── Utakmice ── */}
        <div className="space-y-3">
          {ucitavam && fiksature.length === 0 && <p className="text-sm text-muted-foreground">Učitavam utakmice…</p>}
          {!ucitavam && fiksature.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm font-semibold">Nema utakmica za izabrani dan.</p>
              <p className="mt-1 text-xs text-muted-foreground">Probaj drugi dan ili sport.</p>
            </div>
          )}
          {fiksature.map((f) => {
            const ponude = ponudeByFixture[f.id] ?? [];
            const vrijeme = formatZagrebIzUlaza(f.vrijeme ?? null);
            return (
              <div key={f.id} className="rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                  <div className="text-sm font-bold">{f.dom} <span className="text-muted-foreground">–</span> {f.gost}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded bg-secondary/60 px-1.5 py-0.5 font-semibold">{vrijeme ?? "—"}</span>
                    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-semibold text-sky-400">#{f.id}</span>
                  </div>
                </div>
                <div className="space-y-2.5 px-3 py-2.5">
                  {grupaTrzista.map((grupa) => {
                    const opcije = ponude.filter((p) => {
                      const kat = trzistaZaSport(sport).find((t) => t.tip === p.tip && t.trziste === p.trziste);
                      return kat?.grupa === grupa;
                    });
                    if (opcije.length === 0) return null;
                    return (
                      <div key={grupa}>
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{grupa}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {opcije.map((p) => {
                            const odabran = odabrane.has(`${f.id}|${p.trziste}|${p.tip}`);
                            return (
                              <button
                                key={p.tip}
                                onClick={() => toggle(sport, f, p)}
                                className={`min-w-[64px] rounded-lg border px-2 py-1.5 text-center transition ${
                                  odabran
                                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.25)]"
                                    : "border-border bg-secondary/40 hover:border-primary/50 hover:bg-secondary"
                                }`}
                                title={`${p.tip} @ ${p.kvota.toFixed(2)} (${p.izvorKvote === "api" ? "API" : "model"})`}
                              >
                                <div className="text-[10px] font-bold uppercase tracking-wide">{p.label}</div>
                                <div className={`text-sm font-bold tabular-nums ${odabran ? "text-emerald-300" : "text-foreground"}`}>{p.kvota.toFixed(2)}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Listić ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Ticket className="h-4 w-4 text-amber-400" />
                Listić
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${slip.length >= MAX_NOGU ? "bg-red-500/15 text-red-400" : "bg-secondary/60 text-muted-foreground"}`}>
                  {slip.length}/{MAX_NOGU}
                </span>
              </div>
              {slip.length > 0 && (
                <button onClick={() => { ocistiSlip(); setSlip([]); }} className="text-[11px] text-muted-foreground hover:text-destructive" title="Očisti listić">
                  <Trash2 className="inline h-3 w-3" /> Očisti
                </button>
              )}
            </div>

            {slip.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Klikni kvotu da dodaš nogu na listić. Miješaj nogomet, košarku i rukomet.</p>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto px-3 py-2">
                {slip.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-secondary/30 px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold">{n.label} <span className="text-muted-foreground">@</span> {n.kvota.toFixed(2)}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{n.utakmica}{n.datum ? ` · ${formatZagrebIzUlaza(n.datum) ?? ""}` : ""}</div>
                    </div>
                    <button
                      onClick={() => { ukloniSSlipa(n.id); setSlip(ucitajSlip()); }}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Ukloni nogu"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-border/60 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Ukupna kvota</span>
                <span className="font-bold tabular-nums text-amber-300">{ukupnaKvota.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-1 items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5">
                  <span className="text-xs text-muted-foreground">€</span>
                  <input
                    inputMode="decimal"
                    value={ulogUnos}
                    onChange={(e) => setUlogUnos(e.target.value.replace(/[^0-9.,]/g, ""))}
                    className="w-full bg-transparent text-sm font-bold tabular-nums outline-none"
                    placeholder="Ulog"
                  />
                </div>
                {BRZI_ULOZI.map((u) => (
                  <button key={u} onClick={() => setUlogUnos(String(u))} className="rounded-lg border border-border bg-secondary/40 px-1.5 py-1.5 text-[10px] font-bold hover:border-amber-500/40">
                    {u}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Moguća isplata</span>
                <span className="font-bold tabular-nums text-emerald-400">{eur(mogucaIsplata(ulog, slip))}</span>
              </div>
              {slip.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-secondary/30 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  Kombinirana vjerojatnost: <b className="text-foreground">{(analiza.kombiniranaVjerojatnost * 100).toFixed(2)}%</b>
                  {analiza.najveciRizik && <> · najveći rizik: <b className="text-foreground">{analiza.najveciRizik.label} ({analiza.najveciRizik.utakmica.split(" - ")[0]}…)</b></>}
                </div>
              )}
              <button
                onClick={uplati}
                disabled={slip.length === 0 || !(ulog > 0) || ulog > balans}
                className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-40"
              >
                {slip.length === 0 ? "Odaberi noge" : ulog > balans ? "Nedovoljno eura" : `Uplati listić — ${eur(ulog)}`}
              </button>
              <button
                onClick={orionAnaliza}
                disabled={slip.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 py-2 text-sm font-bold text-sky-400 transition hover:bg-sky-500/20 disabled:opacity-40"
              >
                <ScanEye className="h-4 w-4" /> Orion AI Analiza Listića
              </button>
              <p className="text-center text-[10px] text-muted-foreground">
                {transakcije().length} transakcija · gubitni listić isplaćuje €0,00
              </p>
            </div>
          </div>

          <Link
            to="/listici"
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/40 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <Ticket className="h-3.5 w-3.5" /> Moji listići — poravnanje i statistika
          </Link>
        </div>
      </div>

      <SettingsModal open={postavke} onClose={() => setPostavke(false)} />
    </div>
  );
}
