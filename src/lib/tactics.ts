// ══ TACTICAL PROFILING ENGINE v1.0 ══

export type TacticalStyle = "BUNKER" | "JURIŠ" | "PRAGMATIK" | "POSJED";

export interface TacticalProfile {
  style: TacticalStyle;
  scoreShift: number; // -1 smanjuje golove, +1 povećava
  description: string;
}

/** Funkcija koja određuje stil igre na temelju lige ili renomea kluba */
export function getTacticalProfile(teamName: string, league: string): TacticalProfile {
  // Primjeri trenera/timova koji "ubijaju" utakmicu (Bunker/Pragmatik)
  const isPragmatic = /Atletico|Inter|Juventus|Istra|Istra 1961|Genoa|Mourinho|Conte|Simeone/i.test(teamName);
  
  // Primjeri timova koji ne staju (Juriš)
  const isAggressive = /Bayern|Man City|Liverpool|Stuttgart|Bayer Leverkusen|Nizozemska|U21/i.test(teamName);

  if (isPragmatic) {
    return {
      style: "PRAGMATIK",
      scoreShift: -0.5,
      description: "Ovaj tim igra na rezultat. Čim povedu, zatvaraju utakmicu. Ne očekuj golijadu."
    };
  }

  if (isAggressive) {
    return {
      style: "JURIŠ",
      scoreShift: +0.5,
      description: "Ovaj tim igra 'totalni nogomet'. Čak i kad vode 2:0, traže treći gol."
    };
  }

  return {
    style: "POSJED",
    scoreShift: 0,
    description: "Standardni taktički pristup temeljen na posjedu."
  };
}
