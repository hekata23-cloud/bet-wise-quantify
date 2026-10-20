// ============================================================
// AI-CONTEXT — Direktno ubrizgavanje podataka Match Engine-a
// u AI chatbotove (Luna/Callisto i Orion).
//
// MatchInsightPanel spremi najsvježiju SARP analizu ovdje;
// Luna i Orion je automatski pročitaju i ubace u prompt.
// Spremište: localStorage (ključ andromeda.ai.mec-kontekst).
// ============================================================

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
  if (c.rizici?.length) linije.push(`Rizici: ${c.rizici.slice(0, 4).join("; ")}`);
  linije.push(FORMAT_PRAVILO);
  linije.push("(Ove podatke koristi samo ako se korisnik pita o ovoj utakmici ili traži tip.)");
  return linije.join("\n");
}
