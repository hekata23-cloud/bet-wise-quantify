// ══ STVARNI PODACI O UTAKMICI (API-Football) ══
// Cilj: Luna dobije formu, golove, ozljede, H2H i kvote — bez trošenja kvote.
// Zaštita od suspenzije: dugi cache (6–24 h), najviše ~7 poziva po utakmici,
// throttle i dnevni limit već postoje u afGet().
import { afGet, type Fixture } from "./api-football";
import { hasKey } from "./storage";

const D = 24 * 60 * 60 * 1000;
const H6 = 6 * 60 * 60 * 1000;

interface InjuryRow {
  player: { name: string };
  team: { name: string };
}

interface OddsBet {
  name: string;
  values: { value: string; odd: string }[];
}
interface OddsRow {
  bookmakers: { bets: OddsBet[] }[];
}

interface TeamHit {
  team: { id: number; name: string };
}

/** Izvlači dvije momčadi iz poruke: "X vs Y", "X - Y", "X protiv Y", "X:Y". */
export function parseTeams(text: string): [string, string] | null {
  const clean = text.replace(/[?!]/g, " ").replace(/\s+/g, " ").trim();
  const m = clean.match(
    /([\p{L}\p{N}.'’\- ]{2,40}?)\s*(?:\bvs\b|\bv\.?\b|\bprotiv\b|–|—|-|:)\s*([\p{L}\p{N}.'’\- ]{2,40})/iu,
  );
  if (!m) return null;
  const STOP =
    /^(daj|mi|za|tip|treba|trebam|utakmic\w*|analiz\w*|predikcij\w*|sto|što|misliš|mislis|molim|hoće|hoce|na|a|i|je|li|može|moze|evo|bok|pozdrav|luna|kakva|kakav|koji|koja)$/i;
  const a = (m[1] ?? "")
    .split(" ")
    .filter((w) => w && !STOP.test(w))
    .slice(-4)
    .join(" ")
    .trim();
  const b = (m[2] ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .join(" ")
    .trim();
  if (a.length < 2 || b.length < 2) return null;
  return [a, b];
}

async function findTeamId(name: string): Promise<TeamHit | null> {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const tries = new Set<string>();
  for (let n = words.length; n >= 1; n--) tries.add(words.slice(0, n).join(" "));
  const longest = [...words].sort((x, y) => y.length - x.length)[0];
  if (longest) tries.add(longest);
  for (const q of tries) {
    if (q.length < 3) continue;
    try {
      const res = await afGet<TeamHit[]>("teams", { search: q }, { ttlMs: 7 * D });
      if (res?.length) return res[0];
    } catch {
      /* sljedeći pokušaj */
    }
  }
  return null;
}

function formLine(fx: Fixture[], teamId: number): string {
  return fx
    .slice(0, 6)
    .map((f) => {
      const home = f.teams.home.id === teamId;
      const gf = (home ? f.goals.home : f.goals.away) ?? 0;
      const ga = (home ? f.goals.away : f.goals.home) ?? 0;
      const r = gf > ga ? "W" : gf === ga ? "D" : "L";
      return `${r} ${gf}:${ga} vs ${home ? f.teams.away.name : f.teams.home.name}`;
    })
    .join(" | ");
}

function stats(fx: Fixture[], teamId: number) {
  let gf = 0,
    ga = 0,
    btts = 0,
    over = 0;
  const n = Math.max(1, fx.length);
  for (const f of fx) {
    const home = f.teams.home.id === teamId;
    const a = (home ? f.goals.home : f.goals.away) ?? 0;
    const b = (home ? f.goals.away : f.goals.home) ?? 0;
    gf += a;
    ga += b;
    if (a > 0 && b > 0) btts++;
    if (a + b > 2.5) over++;
  }
  return {
    gf: (gf / n).toFixed(2),
    ga: (ga / n).toFixed(2),
    btts: Math.round((btts / n) * 100),
    over: Math.round((over / n) * 100),
  };
}

/** Vraća tekstualni brief sa stvarnim podacima ili null ako nije moguće. */
export async function matchDataBrief(userText: string): Promise<string | null> {
  if (!hasKey("apiFootball")) return null;
  const pair = parseTeams(userText);
  if (!pair) return null;

  try {
    const [ha, aw] = await Promise.all([findTeamId(pair[0]), findTeamId(pair[1])]);
    if (!ha || !aw) return null;

    const [homeFx, awayFx, h2h] = await Promise.all([
      afGet<Fixture[]>("fixtures", { team: ha.team.id, last: 6 }, { ttlMs: H6 }),
      afGet<Fixture[]>("fixtures", { team: aw.team.id, last: 6 }, { ttlMs: H6 }),
      afGet<Fixture[]>(
        "fixtures/headtohead",
        { h2h: `${ha.team.id}-${aw.team.id}`, last: 5 },
        { ttlMs: 7 * D },
      ).catch(() => [] as Fixture[]),
    ]);

    const next = await afGet<Fixture[]>(
      "fixtures",
      { team: ha.team.id, next: 3 },
      { ttlMs: H6 },
    ).catch(() => [] as Fixture[]);
    const fixture = next.find(
      (f) => f.teams.home.id === aw.team.id || f.teams.away.id === aw.team.id,
    );

    let injuries = "nije dostupno";
    let odds = "nisu dostupne";
    if (fixture) {
      const injP = afGet<InjuryRow[]>(
        "injuries",
        { fixture: fixture.fixture.id },
        { ttlMs: H6 },
      ).catch(() => [] as InjuryRow[]);
      const oddP = afGet<OddsRow[]>("odds", { fixture: fixture.fixture.id }, { ttlMs: H6 }).catch(
        () => [] as OddsRow[],
      );
      const inj: InjuryRow[] = await injP;
      const od: OddsRow[] = await oddP;
      if (inj.length)
        injuries = inj
          .slice(0, 12)
          .map((i) => `${i.team?.name}: ${i.player?.name}`)
          .join(", ");
      const bets = od?.[0]?.bookmakers?.[0]?.bets ?? [];
      const pick = (n: string) =>
        bets
          .find((b) => b.name === n)
          ?.values.slice(0, 4)
          .map((v) => `${v.value} ${v.odd}`)
          .join(" / ");
      const parts = [
        pick("Match Winner") && `1X2: ${pick("Match Winner")}`,
        pick("Goals Over/Under") && `O/U: ${pick("Goals Over/Under")}`,
        pick("Both Teams Score") && `GG/NG: ${pick("Both Teams Score")}`,
      ].filter(Boolean);
      if (parts.length) odds = parts.join(" · ");
    }

    const sh = stats(homeFx, ha.team.id);
    const sa = stats(awayFx, aw.team.id);

    return `═══ STVARNI PODACI (API-Football, uživo dohvaćeno) ═══
UTAKMICA: ${ha.team.name} vs ${aw.team.name}${fixture ? ` · ${new Date(fixture.fixture.date).toLocaleString("hr-HR")} · ${fixture.league.name}` : " (termin nije potvrđen u kalendaru)"}
FORMA ${ha.team.name} (zadnjih ${homeFx.length}): ${formLine(homeFx, ha.team.id) || "nema"}
  → prosjek zabija ${sh.gf}, prima ${sh.ga} · GG ${sh.btts}% · Over 2.5 ${sh.over}%
FORMA ${aw.team.name} (zadnjih ${awayFx.length}): ${formLine(awayFx, aw.team.id) || "nema"}
  → prosjek zabija ${sa.gf}, prima ${sa.ga} · GG ${sa.btts}% · Over 2.5 ${sa.over}%
H2H (zadnjih ${h2h.length}): ${
      h2h
        .map((f) => `${f.teams.home.name} ${f.goals.home ?? "-"}:${f.goals.away ?? "-"} ${f.teams.away.name}`)
        .join(" | ") || "nema"
    }
OZLJEDE/IZOSTANCI: ${injuries}
KVOTE: ${odds}

OBAVEZNO: ovo su STVARNI podaci — koristi ih kao temelj svakog tipa i nikad ne piši da nemaš podatke.`;
  } catch (e) {
    console.warn("API-Football brief preskočen:", e);
    return null;
  }
}
