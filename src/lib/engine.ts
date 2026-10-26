// ============================================================
// LINEUP-ENGINE — Confirmed Lineup Scanner & Impact Adjustment
// Čista logika, bez API poziva. Radi s podacima API-Football
// /fixtures/lineups odgovora (startXI) koje dohvaća UI sloj.
//
// Model utjecaja (proxy, javno poznate heuristike):
//  - izlazak GK-a        → protivnička λ ×1.10, vlastita λ ×0.97
//  - izlazak braniča (D) → protivnička λ ×1.06
//  - izlazak veznjaka (M)→ vlastita λ ×0.94, protivnička λ ×1.01
//  - izlazak napadača (F)→ vlastita λ ×0.92, protivnička λ ×0.99
// Ulazak igrača (u odnosu na prijašnju postavu) ima obrnuti učinak.
// ============================================================

export type Pozicija = "G" | "D" | "M" | "F" | "?";

export interface IgracLin {
  id?: number;
  ime: string;
  broj?: number;
  poz?: Pozicija;
  grid?: string; // npr. "1:5" (red:kolona) iz API-Football grid polja
}

export interface PostavaTim {
  tim: string;
  potvrdjena: boolean; // API-Football vraća postave samo kad su objavljene
  formacija?: string;
  startXI: IgracLin[];
  zamjene?: IgracLin[];
}

export interface PostaveIzlaz {
  potvrdjene: boolean; // obje postave potvrđene
  brojPostava: number; // 0, 1 ili 2
  golmanDom: boolean; // ima li startni GK u postavi
  golmanGost: boolean;
}

export interface PostavaRazlika {
  izasliDom: IgracLin[];
  izasliGost: IgracLin[];
  usliDom: IgracLin[];
  usliGost: IgracLin[];
}

export interface UtjecajPostave {
  faktorDom: number; // množitelj λ domaćina
  faktorGost: number; // množitelj λ gosta
  procenat: number; // apsolutni pomak ukupne λ u postotnim bodovima
  opisi: string[]; // ljudski opisi za banner
  imaUtjecaj: boolean;
}

/* ── normalizacija pozicije iz API-Football odgovora ── */
function pozicijaIz(p: { poz?: string; grid?: string }): Pozicija {
  const poz = (p.poz ?? "").toUpperCase();
  if (poz === "G" || poz === "GK" || poz === "GOALKEEPER") return "G";
  if (poz === "D" || poz === "DEFENDER") return "D";
  if (poz === "M" || poz === "MIDFIELDER") return "M";
  if (poz === "F" || poz === "FORWARD" || poz === "ATTACKER") return "F";
  // grid "1:x" je golman
  if ((p.grid ?? "").startsWith("1:")) return "G";
  return "?";
}

function igracIz(raw: any): IgracLin {
  const pl = raw?.player ?? raw ?? {};
  return {
    id: pl.id ?? undefined,
    ime: String(pl.name ?? pl.ime ?? "?"),
    broj: pl.number ?? undefined,
    poz: pozicijaIz({ poz: pl.pos ?? pl.poz, grid: pl.grid }),
    grid: typeof pl.grid === "string" ? pl.grid : undefined,
  };
}

/** Pretvara sirovi API-Football /fixtures/lineups odgovor u naše tipove. */
export function parsirajPostave(odgovor: any): PostavaTim[] {
  const arr = odgovor?.response;
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 2).map((t: any) => ({
    tim: String(t?.team?.name ?? "?"),
    potvrdjena: true, // API vraća tim samo kad je postava objavljena
    formacija: typeof t?.formation === "string" ? t.formation : undefined,
    startXI: Array.isArray(t?.startXI) ? t.startXI.map(igracIz) : [],
    zamjene: Array.isArray(t?.substitutes) ? t.substitutes.map(igracIz) : [],
  }));
}

export function analizirajPostave(postave: PostavaTim[]): PostaveIzlaz {
  const dom = postave[0];
  const gost = postave[1];
  const imaGK = (t?: PostavaTim) =>
    !!t && t.startXI.some((x) => x.poz === "G" || (x.grid ?? "").startsWith("1:"));
  return {
    potvrdjene: !!dom && !!gost && dom.startXI.length >= 7 && gost.startXI.length >= 7,
    brojPostava: postave.length,
    golmanDom: imaGK(dom),
    golmanGost: imaGK(gost),
  };
}

/** Usporedba s prijašnjom (ranije snimljenom) postavom istog tima. */
export function usporediPostaveTim(
  prijasnja: PostavaTim | null,
  trenutna: PostavaTim | null,
): { izasli: IgracLin[]; usli: IgracLin[] } {
  if (!prijasnja || !trenutna) return { izasli: [], usli: [] };
  const kljuc = (x: IgracLin) => String(x.id ?? x.ime).toLowerCase();
  const stari = new Set(prijasnja.startXI.map(kljuc));
  const novi = new Set(trenutna.startXI.map(kljuc));
  const izasli = prijasnja.startXI.filter((x) => !novi.has(kljuc(x)));
  const usli = trenutna.startXI.filter((x) => !stari.has(kljuc(x)));
  return { izasli, usli };
}

const TEZINE: Record<string, { protivnik: number; vlastita: number }> = {
  G: { protivnik: 1.1, vlastita: 0.97 },
  D: { protivnik: 1.06, vlastita: 1.0 },
  M: { protivnik: 1.01, vlastita: 0.94 },
  F: { protivnik: 0.99, vlastita: 0.92 },
  "?": { protivnik: 1.0, vlastita: 0.97 },
};

function primijeniIzlazake(izasli: IgracLin[]): {
  v: number;
  p: number;
  opisi: string[];
} {
  let v = 1;
  let p = 1;
  const opisi: string[] = [];
  const kategorije = new Map<Pozicija, number>();
  for (const x of izasli) {
    const poz = x.poz ?? "?";
    kategorije.set(poz, (kategorije.get(poz) ?? 0) + 1);
  }
  for (const [poz, n] of kategorije) {
    const t = TEZINE[poz] ?? TEZINE["?"];
    // na više izbačenih igrača istog reda utjecaj raste s korijenom, ne linearno
    const g = Math.sqrt(n);
    v *= Math.pow(t.vlastita, g);
    p *= Math.pow(t.protivnik, g);
    const label: Record<Pozicija, string> = {
      G: "startni golman",
      D: "starter u obrani",
      M: "starter u veznom redu",
      F: "starter u napadu",
      "?": "starter",
    };
    opisi.push(
      `Izasao ${n}× ${label[poz]} — vlastita napadačka snaga i protivnički pritisak preračunati.`,
    );
  }
  return { v, p, opisi };
}

function primijeniUlaske(usli: IgracLin[]): {
  v: number;
  p: number;
  opisi: string[];
} {
  let v = 1;
  let p = 1;
  const opisi: string[] = [];
  const kategorije = new Map<Pozicija, number>();
  for (const x of usli) {
    const poz = x.poz ?? "?";
    kategorije.set(poz, (kategorije.get(poz) ?? 0) + 1);
  }
  for (const [poz, n] of kategorije) {
    const t = TEZINE[poz] ?? TEZINE["?"];
    const g = Math.sqrt(n);
    // ulazak novog igrača: blagi obrnuti učinak (60% snage izlaska)
    v *= Math.pow(1 + (1 - t.vlastita) * 0.6, g);
    p *= Math.pow(1 + (1 - t.protivnik) * 0.6, g);
    opisi.push(`Usao novi ${n}× starter — blago jača vlastiti napad / slabi protivnički utjecaj.`);
  }
  return { v, p, opisi };
}

/** Glavna funkcija: razlika postava → množitelji λ dom/gost + opisi za banner. */
export function procijeniUtjecajPostava(raz: PostavaRazlika): UtjecajPostave {
  let faktorDom = 1;
  let faktorGost = 1;
  const opisi: string[] = [];

  const d = primijeniIzlazake(raz.izasliDom);
  faktorDom *= d.v;
  faktorGost *= d.p;
  opisi.push(...d.opisi);

  const g = primijeniIzlazake(raz.izasliGost);
  faktorGost *= g.v;
  faktorDom *= g.p;
  opisi.push(...g.opisi);

  const dU = primijeniUlaske(raz.usliDom);
  faktorDom *= dU.v;
  faktorGost *= dU.p;

  const gU = primijeniUlaske(raz.usliGost);
  faktorGost *= gU.v;
  faktorDom *= gU.p;

  const procenat = ((faktorDom + faktorGost) / 2 - 1) * 100;
  const imaUtjecaj = Math.abs(faktorDom - 1) > 0.015 || Math.abs(faktorGost - 1) > 0.015;
  return {
    faktorDom: Math.round(faktorDom * 1000) / 1000,
    faktorGost: Math.round(faktorGost * 1000) / 1000,
    procenat: Math.round(procenat * 10) / 10,
    opisi,
    imaUtjecaj,
  };
}
