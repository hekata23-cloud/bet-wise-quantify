/* ═══════════════════════════════════════════════════════════════════
   KONZISTENTNOST — Cross-Market Consistency & Value Engine
   ═══════════════════════════════════════════════════════════════════
   Sve tržišta moraju dolaziti iz JEDNE matrice rezultata, pa
   međusobno ne smiju proturječiti:

     • Under 2.5 (visok) nikad ne smije ići uz BTTS YES visok.
     • Over 2.5 ne smije ići uz Under 1.5.
     • BTTS NO dovodi niske rezultate — protivi se Over 2.5/3.5.
     • 1 i 2 istovremeno visoki = uzajamno isključivi.
     • P(Over 3.5) ≤ P(Over 2.5) ≤ P(Over 1.5) — monotonija linija.
     • HT/FT 2/2 protivi se tipu 1 (1X2).

   Dodatno: evKelly() — jedinstven EV + frakcijski Kelly (0.25×)
   koji svaka kartica koristi za "koliko banke riskirati".
   ═══════════════════════════════════════════════════════════════════ */

export type TipZaProvjeru = { trziste: string; tip: string; p: number };

export type KonzistentnostIzlaz = {
  konzistentno: boolean;
  upozorenja: string[];
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

/** Nađi vjerojatnost picka po (dio tržišta, dio tipa) — tolerantno na nazive. */
function nadjiP(tipovi: TipZaProvjeru[], trzisteRe: RegExp, tipRe: RegExp): number | null {
  for (const t of tipovi) {
    if (trzisteRe.test(t.trziste) && tipRe.test(t.tip)) return clamp01(t.p);
  }
  return null;
}

const norm = (s: string) => s.toLowerCase();

/**
 * Provjera kontradikcija između tipova koje korisnik/model stavlja
 * na ISTU utakmicu. Vraća listu upozorenja (prazno = konzistentno).
 */
export function provjeriKonzistentnost(tipovi: TipZaProvjeru[]): KonzistentnostIzlaz {
  const upozorenja: string[] = [];
  if (tipovi.length < 2) return { konzistentno: true, upozorenja };

  const T = tipovi.map((t) => ({ trziste: norm(t.trziste), tip: norm(t.tip), p: clamp01(t.p) }));
  const P = (trzisteRe: RegExp, tipRe: RegExp) => nadjiP(T, trzisteRe, tipRe);

  const u25 = P(/o\/u|over|total|gol/i, /under\s*2\.?5|u2\.?5/);
  const o25 = P(/o\/u|over|total|gol/i, /over\s*2\.?5|o2\.?5/);
  const o35 = P(/o\/u|over|total|gol/i, /over\s*3\.?5|o3\.?5/);
  const o15 = P(/o\/u|over|total|gol/i, /over\s*1\.?5|o1\.?5/);
  const u15 = P(/o\/u|over|total|gol/i, /under\s*1\.?5|u1\.?5/);
  const bttsDa = P(/btts|gg/i, /da|yes|gg/);
  const bttsNe = P(/btts|gg/i, /ne|no|ng/);
  const p1 = P(/1x2|moneyline|pobjed/i, /^1$|doma|home/);
  const p2 = P(/1x2|moneyline|pobjed/i, /^2$|gost|away/);
  const htft22 = P(/ht\/ft|htft/i, /2\/2/);
  const htft11 = P(/ht\/ft|htft/i, /1\/1/);

  if (u25 != null && u25 >= 0.60 && bttsDa != null && bttsDa >= 0.55) {
    upozorenja.push(
      `KONTRADIKCIJA: Under 2.5 (${Math.round(u25 * 100)}%) uz BTTS YES (${Math.round(bttsDa * 100)}%) — BTTS gotovo uvijek znači 2+ gola.`,
    );
  }
  if (u15 != null && u15 >= 0.50 && bttsDa != null && bttsDa >= 0.55) {
    upozorenja.push(`KONTRADIKCIJA: Under 1.5 uz BTTS YES — oba tima daju gol znači 2+ golova.`);
  }
  if (o25 != null && o25 >= 0.60 && u15 != null && u15 >= 0.50) {
    upozorenja.push(`KONTRADIKCIJA: Over 2.5 (${Math.round(o25 * 100)}%) uz Under 1.5 (${Math.round(u15 * 100)}%) — nemoguće istovremeno.`);
  }
  if (o35 != null && o25 != null && o35 > o25 + 0.02) {
    upozorenja.push(`NEKONZISTENTNE LINIJE: P(Over 3.5) > P(Over 2.5) — viša linija ne smije imati veću vjerojatnost.`);
  }
  if (o25 != null && o15 != null && o25 > o15 + 0.02) {
    upozorenja.push(`NEKONZISTENTNE LINIJE: P(Over 2.5) > P(Over 1.5).`);
  }
  if (o25 != null && o25 >= 0.60 && bttsNe != null && bttsNe >= 0.60) {
    upozorenja.push(
      `NAPETOST: BTTS NO (${Math.round(bttsNe * 100)}%) uz Over 2.5 (${Math.round(o25 * 100)}%) — bez golova jednog tima teško je prijeći 2.5.`,
    );
  }
  if (p1 != null && p1 >= 0.55 && p2 != null && p2 >= 0.55) {
    const zajedno = p1 + p2 - 1;
    if (zajedno > 0.05) {
      upozorenja.push(`KONTRADIKCIJA: Domaćin (${Math.round(p1 * 100)}%) i gost (${Math.round(p2 * 100)}%) — uzajamno isključivi.`);
    }
  }
  if (p1 != null && p1 >= 0.55 && htft22 != null && htft22 >= 0.30) {
    upozorenja.push(`KONTRADIKCIJA: Tip 1 uz HT/FT 2/2 — 2/2 znači pobjedu gosta.`);
  }
  if (p2 != null && p2 >= 0.55 && htft11 != null && htft11 >= 0.30) {
    upozorenja.push(`KONTRADIKCIJA: Tip 2 uz HT/FT 1/1 — 1/1 znači pobjedu domaćina.`);
  }

  return { konzistentno: upozorenja.length === 0, upozorenja };
}

/* ───────────── Jedinstveni EV + frakcijski Kelly (0.25×) ───────────── */

export type EvKelly = {
  evPct: number;      // očekivana vrijednost u %
  kellyPct: number;   // preporučeni ulog u % banke (frakcijski, capped)
  isplativo: boolean;
};

/**
 * EV i Kelly za jedan tip na nekoj kartici.
 * @param p        model vjerojatnost (0..1) — po mogućnosti kalibrirana (anti-loss)
 * @param kvota    kladioničarska kvota (>1)
 * @param kellyFrac frakcija Kellyja (default 0.25 = četvrt Kelly)
 * @param capPerc  max ulog u % banke (default 3)
 */
export function evKelly(
  p: number,
  kvota: number,
  kellyFrac = 0.25,
  capPerc = 3,
): EvKelly {
  const pp = clamp01(p);
  const k = Math.max(1.01, kvota);
  const evPct = (pp * k - 1) * 100;
  const b = k - 1;
  const q = 1 - pp;
  const kelly = b > 0 ? (b * pp - q) / b : 0;
  const kellyPct = Math.max(0, Math.min(capPerc, kelly * kellyFrac * 100));
  return { evPct, kellyPct, isplativo: evPct > 0 && kellyPct > 0 };
}

