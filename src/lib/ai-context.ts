// ============================================================
// AI-CONTEXT — Direktno ubrizgavanje podataka Match Engine-a
// u AI chatbotove (Luna/Callisto i Orion).
//
// MatchInsightPanel spremi najsvježiju SARP analizu ovdje;
// Luna i Orion je automatski pročitaju i ubace u prompt.
// Spremište: localStorage (ključ andromeda.ai.mec-kontekst).
// ============================================================
import { formatEdgeCaseSignals, formatEnterpriseSignals, type EnterpriseMatchSignals, type EdgeCaseMatchSignals } from "./enterprise-precision";

/** KVANT NADGRADNJA (v5): egzaktni Skellam push, hazard β, OT model
 *  i rukometna taktika (7v6 / golman-umor) — izravno u prompt chatova. */
export interface KvantKontekst {
  skellam?: {
    p1: number; pX: number; p2: number;
    ah: { linija: string; win: number; push: number; loss: number; fer: number }[];
    pushRizikMax: number;
  };
  hazard?: { beta: number; primijenjen: boolean; scenarij: string; lamDomEf: number; lamGostEf: number };
  ot?: { p: number; primijenjeno: boolean; pomakBodovi: number };
  ht?: { ekstraGolovi7v6: number; primijenjeno: boolean; gkUmorDom: boolean; gkUmorGost: boolean };
  /** v6 OKOLIS: weather drag (vjetar/kiša/teren) — pomak golova i kornera */
  okolis?: {
    primijenjeno: boolean; pomakGolovi: number; pomakKornera: number;
    razlozi: string[]; opis: string;
  };
  /** v6 SUDAC: profil suca + rizik crvenog kartona */
  sudac?: {
    primijenjeno: boolean; strog: boolean; rizikCrvena: number; opis: string;
  };
  /** v6 BLOWOUT (košarka): garbage-time korekcija totala kod velikih margina */
  blowout?: { primijenjeno: boolean; margina: number; pomakBodovi: number };
  /** v6 GARBAGE TIME (rukomet): tempo-dolaziš kod velike live razlike */
  garbageTime?: { primijenjeno: boolean; margina: number | null; minut: number | null; ekstraGolovi: number };
}

/* ── TIKET KONTEKST (v6) — Ticket Variance Score i korelacije u chat.
   Korpa.tsx sprema posljednju analizu tiketa ovdje; Luna i Orion
   je čitaju kada se korisnik pita o tiketu/korpi. */
export interface TiketKontekst {
  brojNoga: number;
  kvota: number;
  vjerojatnost: number;
  edge: number;
  korelacijaUpozorenje: boolean;
  nemoguceNoge: boolean;
  varijanca: {
    razina: string;
    entropija: number;
    remiPushNoge: number;
    upozorenje: string | null;
  };
  noge: { utakmica: string; trziste: string; tip: string; kvota: number; p: number }[];
  spremljeno: number;
}

const TIKET_KEY = "andromeda.ai.tiket-kontekst";
const TIKET_TTL = 12 * 60 * 60 * 1000;

export function spremiKontekstTiketa(t: Omit<TiketKontekst, "spremljeno">): void {
  try {
    localStorage.setItem(TIKET_KEY, JSON.stringify({ ...t, spremljeno: Date.now() }));
    window.dispatchEvent(new CustomEvent("andromeda:tiket-kontekst"));
  } catch { /* puna memorija — ignoriraj */ }
}

export function ucitajKontekstTiketa(): TiketKontekst | null {
  try {
    const raw = localStorage.getItem(TIKET_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TiketKontekst;
    if (!t || typeof t.brojNoga !== "number") return null;
    if (Date.now() - (t.spremljeno ?? 0) > TIKET_TTL) return null;
    return t;
  } catch {
    return null;
  }
}

export function izbrisiKontekstTiketa(): void {
  try { localStorage.removeItem(TIKET_KEY); } catch { /* ignoriraj */ }
  window.dispatchEvent(new CustomEvent("andromeda:tiket-kontekst"));
}

/** Tiket blok za AI prompt — Ticket Variance Score, korelacije i noge. */
export function izgradiTiketTekst(t: TiketKontekst): string {
  const linije: string[] = [];
  linije.push("── PODACI BET SLIP-a (Korpa) — kontekst tiketa ──");
  linije.push(
    `Tiket: ${t.brojNoga} noga · ukupna kvota ${t.kvota.toFixed(2)} · kombinirana vjerojatnost ${pct(t.vjerojatnost)} · ` +
    `EV ${(t.edge * 100).toFixed(1)}%`,
  );
  linije.push(
    `TICKET VARIANCE SCORE: ${t.varijanca.razina.toUpperCase()} (Shannon entropija ${(t.varijanca.entropija * 100).toFixed(0)}%)` +
    ` · noga s remi/push rizikom: ${t.varijanca.remiPushNoge}`,
  );
  if (t.korelacijaUpozorenje)
    linije.push("Korelacija: više noga iz iste utakmice — ishodi nisu nezavisni (korelacijski motor je korigira).");
  if (t.nemoguceNoge)
    linije.push("UPOZORENJE: tiket sadrži uzajamno isključive noge — ne može proći.");
  if (t.varijanca.upozorenje) linije.push(t.varijanca.upozorenje);
  if (t.noge?.length) {
    linije.push(
      "Noge: " + t.noge.map((n) => `${n.tip} @${n.kvota.toFixed(2)} (${n.utakmica}, ${n.trziste})`).join(" | "),
    );
  }
  linije.push("(Ove podatke koristi samo ako se korisnik pita o tiketu, korpi ili ulozi.)");
  return linije.join("\n");
}

export interface MecKontekst {
  naslov: string;
  liga?: string;
  vrijeme?: string;
  kvote: Record<string, number>;
  lambdaDom: number;
  lambdaGost: number;
  lambdaUkupno: number;
  konsenzus: Record<string, number>;
  coreTip: { label: string; p: number; kvota?: number; edge?: number; kellyPct: number; kljuc: string };
  altTip?: { label: string; p: number; kvota?: number } | null;
  mc: { btts: number; o15: number; o25: number; o35: number; p1: number; pX: number; p2: number };
  ocjena: string;
  povjerenje: number;
  brojIzvora: number;
  rizici: string[];
  postave?: {
    potvrdjene: boolean;
    izasli: string[];
    procenatPomaka: number | null;
  } | null;
  live?: {
    minuta: number;
    rezultat: string;
    o25: number;
    btts: number;
    sljedeciDom: number;
    sljedeciGost: number;
  } | null;
  /** v5: kvant nadogradnja (Skellam AH push, hazard, OT, 7v6) */
  kvant?: KvantKontekst;
  /** Dodatne izmjerene Enterprise Precision vrijednosti; prazno = bez korekcije. */
  enterprise?: EnterpriseMatchSignals;
  /** Opcionalni izmjereni cirkadijalni/klupa/suspenzija signali za Luna i Orion. */
  edgeCases?: EdgeCaseMatchSignals;
  spremljeno: number;
}

const KEY = "andromeda.ai.mec-kontekst";
const TTL = 12 * 60 * 60 * 1000; // 12 h — stari kontekst se sam briše

export function spremiKontekstMeca(c: Omit<MecKontekst, "spremljeno">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, spremljeno: Date.now() }));
    window.dispatchEvent(new CustomEvent("andromeda:mec-kontekst"));
  } catch { /* puna memorija — ignoriraj */ }
}

export function ucitajKontekstMeca(): MecKontekst | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as MecKontekst;
    if (!c || !c.naslov || !c.coreTip) return null;
    if (Date.now() - (c.spremljeno ?? 0) > TTL) return null;
    return c;
  } catch {
    return null;
  }
}

export function izbrisiKontekstMeca(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignoriraj */ }
  window.dispatchEvent(new CustomEvent("andromeda:mec-kontekst"));
}

/** Pravilo formata: prva rečenica odgovora je uvijek tip + sigurnost. */
export const FORMAT_PRAVILO =
  "FORMAT ODGOVORA (obavezno): prva rečenica je uvijek \"**Tip:** <tip> · **Sigurnost:** <X>%\"" +
  " (i kvota/edge ako postoje). Odmah zatim: matematičko obrazloženje (Poisson/Dixon-Coles, " +
  "Monte Carlo, Kelly), glavni rizik, pa preporučeni ulog. BEZ uvodnih fraza tipa \"odlično pitanje\".";

const LABELI: Record<string, string> = {
  "1": "1", "X": "X", "2": "2",
  bttsDa: "GG da", bttsNe: "GG ne",
  o15: "O1.5", u15: "U1.5", o25: "O2.5", u25: "U2.5", o35: "O3.5", u35: "U3.5",
};

function pct(x: number | undefined): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}

/** Kompaktni tekstualni blok s podacima motora — ide u AI prompt. */
export function izgradiKontekstTekst(c: MecKontekst): string {
  const kvote = Object.entries(c.kvote ?? {})
    .filter(([, v]) => typeof v === "number" && v > 1)
    .map(([k, v]) => `${LABELI[k] ?? k}: ${v.toFixed(2)}`)
    .join(" | ");
  const kons = Object.entries(c.konsenzus ?? {})
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${LABELI[k] ?? k}=${pct(v)}`)
    .join(" ");

  const linije: string[] = [];
  linije.push("── PODACI MATCH ENGINE-a (SARP/Titan) — automatski kontekst ──");
  linije.push(`Utakmica: ${c.naslov}${c.liga ? ` (${c.liga}` + (c.vrijeme ? `, ${c.vrijeme}` : "") + ")" : ""}`);
  if (kvote) linije.push(`Tržišne kvote: ${kvote}`);
  linije.push(`Model λ: domaćin ${c.lambdaDom.toFixed(2)} · gost ${c.lambdaGost.toFixed(2)} · ukupno ${c.lambdaUkupno.toFixed(2)}`);
  if (kons) linije.push(`Konsenzus modela: ${kons}`);
  linije.push(
    `GLAVNI TIP: ${c.coreTip.label}${c.coreTip.kvota ? ` @${c.coreTip.kvota.toFixed(2)}` : ""} — ` +
    `sigurnost ${pct(c.coreTip.p)}` +
    (c.coreTip.edge != null ? `, edge ${(c.coreTip.edge * 100).toFixed(1)}%` : "") +
    `, ¼ Kelly ${c.coreTip.kellyPct.toFixed(1)}% banke`,
  );
  if (c.altTip) {
    linije.push(`Alternativa (sigurnija): ${c.altTip.label}${c.altTip.kvota ? ` @${c.altTip.kvota.toFixed(2)}` : ""} — ${pct(c.altTip.p)}`);
  }
  linije.push(
    `Monte Carlo: 1=${pct(c.mc.p1)} X=${pct(c.mc.pX)} 2=${pct(c.mc.p2)} | BTTS=${pct(c.mc.btts)} | ` +
    `O1.5=${pct(c.mc.o15)} O2.5=${pct(c.mc.o25)} O3.5=${pct(c.mc.o35)}`,
  );
  linije.push(`Povjerenje modela: ${c.ocjena} (${c.povjerenje}/100) · izvora podataka: ${c.brojIzvora}`);
  if (c.postave) {
    linije.push(
      `Postave: ${c.postave.potvrdjene ? "POTVRĐENE" : "nepotvrđene"}` +
      (c.postave.izasli.length ? ` — izasli: ${c.postave.izasli.join(", ")}` : "") +
      (c.postave.procenatPomaka != null ? ` — preračunati λ pomak: ${c.postave.procenatPomaka > 0 ? "+" : ""}${c.postave.procenatPomaka}%` : ""),
    );
  }
  if (c.live) {
    linije.push(
      `LIVE: ${c.live.minuta}' rezultat ${c.live.rezultat} — O2.5 ${pct(c.live.o25)}, BTTS ${pct(c.live.btts)}, ` +
      `sljedeći gol: dom ${pct(c.live.sljedeciDom)} / gost ${pct(c.live.sljedeciGost)}`,
    );
  }
  if (c.kvant) {
    const q = c.kvant;
    if (q.okolis?.primijenjeno) {
      linije.push(
        `KVANT Okolis: ${q.okolis.opis} — ukupna λ i korneri su ispravljeno niži; Under i U-kartonska tržišta su blago favorizirana`,
      );
    }
    if (q.sudac?.primijenjeno) {
      linije.push(
        q.sudac.strog
          ? `KVANT Sudac: ${q.sudac.opis} — očekuj više kartona: rizik crvenog kartona ${pct(q.sudac.rizikCrvena)} > 18%`
          : `KVANT Sudac: ${q.sudac.opis}`,
      );
    }
    if (q.blowout?.primijenjeno) {
      linije.push(
        `KVANT Blowout (košarka): očekivana margina ${q.blowout.margina.toFixed(1)} > 16.5 → total +${q.blowout.pomakBodovi.toFixed(1)} poena (garažna 4. četvrtina, DRtg +6%, klupe)`,
      );
    }
    if (q.garbageTime?.primijenjeno) {
      linije.push(
        `KVANT Garbage time (rukomet): razlika ${q.garbageTime.margina?.toFixed(0)} golova u ${q.garbageTime.minut?.toFixed(0)}. min → tempo +${q.garbageTime.ekstraGolovi.toFixed(1)} gola (tranzicijske kontra)`,
      );
    }
    if (q.skellam) {
      linije.push(
        `KVANT Skellam (egzaktno): 1X2 bez marže ${pct(q.skellam.p1)}/${pct(q.skellam.pX)}/${pct(q.skellam.p2)} · azijski handicap: ` +
        q.skellam.ah.map((a) => `AH ${a.linija} (dobitak ${pct(a.win)}${a.push > 0.001 ? `, PUSH RISK ${pct(a.push)}` : ""})`).join("; ") +
        ` · maksimalni push rizik ${pct(q.skellam.pushRizikMax)}`,
      );
    }
    if (q.hazard?.primijenjen) {
      linije.push(
        `KVANT Hazard: scenarij "${q.hazard.scenarij}" — obe efektivne λ ×β=${q.hazard.beta.toFixed(2)}: dom ${q.hazard.lamDomEf.toFixed(2)}, gost ${q.hazard.lamGostEf.toFixed(2)}`,
      );
    }
    if (q.ot) {
      linije.push(
        q.ot.primijenjeno
          ? `KVANT OT model: P(OT)=${pct(q.ot.p)} > 8.5% → totalu je dodano +${q.ot.pomakBodovi.toFixed(1)} poena (produžetak dodaje posjede i failove)`
          : `KVANT OT model: P(OT)=${pct(q.ot.p)} — ispod praga 8.5%, total bez pomaka`,
      );
    }
    if (q.ht?.primijenjeno) {
      linije.push(
        `KVANT rukomet: 7v6 prazna mreža +${q.ht.ekstraGolovi7v6.toFixed(1)} gola` +
        (q.ht.gkUmorDom ? " · golman domaćina umoran (−4% obrana u 2H)" : "") +
        (q.ht.gkUmorGost ? " · golman gosta umoran (−4% obrana u 2H)" : ""),
      );
    }
  }
  if (c.edgeCases) {
    const edgeCaseLines = formatEdgeCaseSignals(c.edgeCases);
    if (edgeCaseLines.length) {
      linije.push("── MATCH EDGE-CASE SIGNALS (samo dostavljeni/izmjereni ulazi) ──");
      linije.push(...edgeCaseLines);
    }
  }
  if (c.enterprise) {
    const enterpriseLines = formatEnterpriseSignals(c.enterprise);
    if (enterpriseLines.length) {
      linije.push("── ENTERPRISE PRECISION (samo dostavljeni/izmjereni ulazi) ──");
      linije.push(...enterpriseLines);
    }
  }
  if (c.rizici?.length) linije.push(`Rizici: ${c.rizici.slice(0, 4).join("; ")}`);
  linije.push(FORMAT_PRAVILO);
  linije.push("(Ove podatke koristi samo ako se korisnik pita o ovoj utakmici ili traži tip.)");
  return linije.join("\n");
}
