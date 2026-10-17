/* ============================================================
   DNEVNIK.TS — dnevnik tipova (v2: nogomet + košarka + rukomet)
   Svrha: da znaš SVOJU stvarnu uspješnost po kartici, a ne osjećaj.
   Radi u pregledniku (localStorage), ključ "pc.dnevnik.v1", max 600 unosa.
   Svaka kartica pri analizi upiše svoj tip; Dnevnik kasnije dohvati
   stvarni rezultat i izračuna hit rate i Brier ocjenu po kartici.
   ============================================================ */

export type Provjera =
  | { vrsta: "1x2"; strana: "1" | "X" | "2" }
  | { vrsta: "btts"; strana: "da" | "ne" }
  | { vrsta: "ou"; strana: "over" | "under"; linija: number }
  | { vrsta: "htft"; kod: string };

export type DnevnikUnos = {
  id: string;
  sport: "nogomet" | "kosarka" | "rukomet";
  kartica: string;
  utakmica: string;
  liga: string | null;
  datum: string;      // kad je tip zapisan
  fixtureId: number;  // ID utakmice u API-ju
  tip: string;
  p: number;          // vjerojatnost koju je dao model (0..1)
  kvota: number | null;
  provjera: Provjera;
  status: "cekaj" | "pogodak" | "promasaj";
  rezultat?: string;  // npr. "2 — 1 (1 — 0)"
};

const KLJUC = "pc.dnevnik.v1";
const MAX = 600;

export function dnevnikUnosi(): DnevnikUnos[] {
  try {
    const raw = localStorage.getItem(KLJUC);
    if (!raw) return [];
    const arr = JSON.parse(raw) as DnevnikUnos[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function spremi(unosi: DnevnikUnos[]) {
  try {
    localStorage.setItem(KLJUC, JSON.stringify(unosi.slice(0, MAX)));
  } catch { /* pun localStorage — preskoči */ }
}

/** Očisti duplikate: isti fixture + kartica + tip = jedan unos. */
export function zapisiTip(u: {
  sport?: DnevnikUnos["sport"];
  kartica: string;
  utakmica: string;
  liga: string | null;
  fixtureId: number;
  tip: string;
  p: number;
  kvota: number | null;
  provjera: Provjera;
}) {
  const sport: DnevnikUnos["sport"] = u.sport ?? "nogomet";
  const unosi = dnevnikUnosi();
  const postoji = unosi.find(
    (x) => x.fixtureId === u.fixtureId && x.kartica === u.kartica && x.tip === u.tip,
  );
  if (postoji) return;
  unosi.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sport,
    kartica: u.kartica,
    utakmica: u.utakmica,
    liga: u.liga,
    datum: new Date().toISOString(),
    fixtureId: u.fixtureId,
    tip: u.tip,
    p: u.p,
    kvota: u.kvota,
    provjera: u.provjera,
    status: "cekaj",
  });
  spremi(unosi);
}

/** Je li tip pogođen prema završnom rezultatu? */
export function pogodakLi(pr: Provjera, dom: number, gost: number, domHT: number | null, gostHT: number | null): boolean {
  switch (pr.vrsta) {
    case "1x2":
      return pr.strana === (dom > gost ? "1" : dom < gost ? "2" : "X");
    case "btts":
      return pr.strana === (dom > 0 && gost > 0 ? "da" : "ne");
    case "ou": {
      const uk = dom + gost;
      return pr.strana === (uk > pr.linija ? "over" : "under");
    }
    case "htft": {
      if (domHT == null || gostHT == null) return false;
      const ht = domHT > gostHT ? "1" : domHT < gostHT ? "2" : "X";
      const ft = dom > gost ? "1" : dom < gost ? "2" : "X";
      return pr.kod === `${ht}/${ft}`;
    }
  }
}

export type KarticaStat = {
  kartica: string;
  igrano: number;
  pogodeno: number;
  hitRate: number;
  brier: number;         // 0 = savršeno, 0.25 = novčić
  prosjekKvota: number | null;
};

/** Statistika po kartici: hit rate, Brier (kvaliteta vjerojatnosti), prosjek kvota. */
export function statistika(): KarticaStat[] {
  const unosi = dnevnikUnosi().filter((u) => u.status !== "cekaj");
  const po = new Map<string, DnevnikUnos[]>();
  for (const u of unosi) {
    const arr = po.get(u.kartica) ?? [];
    arr.push(u);
    po.set(u.kartica, arr);
  }
  const out: KarticaStat[] = [];
  for (const [kartica, arr] of po) {
    const pogodeno = arr.filter((u) => u.status === "pogodak").length;
    const brier =
      arr.reduce((a, u) => {
        const cilj = u.status === "pogodak" ? 1 : 0;
        return a + (u.p - cilj) * (u.p - cilj);
      }, 0) / arr.length;
    const sKvotom = arr.filter((u) => u.kvota != null);
    out.push({
      kartica,
      igrano: arr.length,
      pogodeno,
      hitRate: arr.length ? pogodeno / arr.length : 0,
      brier,
      prosjekKvota: sKvotom.length ? sKvotom.reduce((a, u) => a + (u.kvota ?? 0), 0) / sKvotom.length : null,
    });
  }
  return out.sort((a, b) => b.igrano - a.igrano);
}
// Brisanje cijelog dnevnika (koristi stranica /dnevnik).
export function brisiDnevnik(): void {
  try {
    localStorage.removeItem(KLJUC);
  } catch {
    // localStorage nedostupan — ignoriraj
  }
}
