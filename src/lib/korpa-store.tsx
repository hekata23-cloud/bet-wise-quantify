// ============================================================
// KORPA-STORE — globalno stanje listića (Bet Slip) kroz
// React Context + localStorage persistencija.
//
// Izvor istine za noge ostaje korpa.ts (localStorage +
// "andromeda:korpa" događaj), pa dodajUKorpu() pozivi iz ostatka
// aplikacije i dalje rade — store se samo sinkronizira.
// Ulog, bankroll i Kelly frakcija također prežive reload.
// ============================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadKorpa,
  dodajUKorpu,
  ukloniIzKorpe,
  ocistiKorpu,
  type KorpaTip,
} from "./korpa";
import { loadJSON, saveJSON } from "./storage";

const BANKROLL_KEY = "andromeda.bankroll";
const KELLY_KEY = "andromeda.kelly.frac";
const ULOG_KEY = "andromeda.korpa.ulog";

export interface KorpaStore {
  tipovi: KorpaTip[];
  ulog: string;
  bankroll: number;
  kellyFrac: number;
  dodaj: (tip: Omit<KorpaTip, "dodano">) => void;
  ukloni: (id: string) => void;
  ocisti: () => void;
  setUlog: (v: string) => void;
  setBankroll: (v: number) => void;
  setKellyFrac: (v: number) => void;
}

const KorpaContext = createContext<KorpaStore | null>(null);

export function KorpaProvider({ children }: { children: ReactNode }) {
  const [tipovi, setTipovi] = useState<KorpaTip[]>(() => loadKorpa());
  const [ulog, setUlog] = useState<string>(() => loadJSON<string>(ULOG_KEY, ""));
  const [bankroll, setBankroll] = useState<number>(() => loadJSON<number>(BANKROLL_KEY, 100));
  const [kellyFrac, setKellyFrac] = useState<number>(() => loadJSON<number>(KELLY_KEY, 0.25));

  // Sinkronizacija s localStorage izvorom istine (korpa.ts) —
  // hvata promjene iz bilo kojeg dijela aplikacije i drugih tabova.
  useEffect(() => {
    const h = () => setTipovi(loadKorpa());
    window.addEventListener("andromeda:korpa", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("andromeda:korpa", h);
      window.removeEventListener("storage", h);
    };
  }, []);

  // Persistencija postavki preko reloada.
  useEffect(() => saveJSON(ULOG_KEY, ulog), [ulog]);
  useEffect(() => saveJSON(BANKROLL_KEY, bankroll), [bankroll]);
  useEffect(() => saveJSON(KELLY_KEY, kellyFrac), [kellyFrac]);

  const dodaj = useCallback((tip: Omit<KorpaTip, "dodano">) => {
    dodajUKorpu(tip); // piše localStorage + diže događaj → listener osvježi state
    setTipovi(loadKorpa());
  }, []);
  const ukloni = useCallback((id: string) => {
    ukloniIzKorpe(id);
    setTipovi(loadKorpa());
  }, []);
  const ocisti = useCallback(() => {
    ocistiKorpu();
    setTipovi([]);
  }, []);
  const postaviBankroll = useCallback(
    (v: number) => setBankroll(Number.isFinite(v) ? Math.max(0, v) : 0),
    [],
  );
  const postaviKelly = useCallback(
    (v: number) => setKellyFrac(Number.isFinite(v) ? Math.min(1, Math.max(0.05, v)) : 0.25),
    [],
  );

  const value = useMemo<KorpaStore>(
    () => ({
      tipovi,
      ulog,
      bankroll,
      kellyFrac,
      dodaj,
      ukloni,
      ocisti,
      setUlog,
      setBankroll: postaviBankroll,
      setKellyFrac: postaviKelly,
    }),
    [tipovi, ulog, bankroll, kellyFrac, dodaj, ukloni, ocisti, postaviBankroll, postaviKelly],
  );

  return <KorpaContext.Provider value={value}>{children}</KorpaContext.Provider>;
}

export function useKorpa(): KorpaStore {
  const ctx = useContext(KorpaContext);
  if (!ctx) throw new Error("useKorpa mora biti unutar <KorpaProvider>");
  return ctx;
}
