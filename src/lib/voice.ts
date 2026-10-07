// Glasovni modul — hrvatski STT (prepoznavanje) i TTS (govor).
// Asistentica se zove Luna (alias: Callisto) i govori nježnim ženskim glasom.
// Sve postavke glasa (brzina, visina, glasnoća, odabrani glas, jezik) su
// korisnički podesive i spremaju se u localStorage.
import { loadJSON, saveJSON } from "./storage";

export const ASSISTANT_NAME = "Luna";
export const ASSISTANT_ALIASES = ["luna", "callisto", "kalisto", "lune", "callist"];

export interface VoicePrefs {
  /** URI odabranog glasa; prazno = automatski najbolji hrvatski ženski. */
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  /** Jezik prepoznavanja govora (izvorni hrvatski po defaultu). */
  sttLang: string;
  /** Automatski izgovori svaki odgovor. */
  autoSpeak: boolean;
  /** Traži li se "Luna" na početku rečenice. */
  requireWakeWord: boolean;
  /** Kontinuirano slušanje (diktat dužih rečenica). */
  continuous: boolean;
}

export const DEFAULT_VOICE: VoicePrefs = {
  voiceURI: "",
  rate: 0.98,
  pitch: 1.18,
  volume: 1,
  sttLang: "hr-HR",
  autoSpeak: false,
  requireWakeWord: false,
  continuous: false,
};

const VKEY = "andromeda.voice.prefs";

export function loadVoicePrefs(): VoicePrefs {
  return { ...DEFAULT_VOICE, ...loadJSON<Partial<VoicePrefs>>(VKEY, {}) };
}
export function saveVoicePrefs(p: VoicePrefs): void {
  saveJSON(VKEY, p);
}

/** Svi dostupni glasovi za izbornik u Postavkama (hrvatski prvi). */
export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .slice()
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}


type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: {
      isFinal: boolean;
      length: number;
      [j: number]: { transcript: string; confidence?: number };
    };
  };
}

export function isVoiceSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition) && "speechSynthesis" in window;
}

// Ukloni wake-word ("Luna, ...") s početka i pospremi razmake.
export function normalizeHeard(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  const lower = t.toLowerCase();
  for (const alias of ASSISTANT_ALIASES) {
    if (lower.startsWith(alias)) {
      t = t.slice(alias.length).replace(/^[\s,.!?:-]+/, "");
      break;
    }
  }
  return t.trim();
}

export function isAddressedToAssistant(text: string): boolean {
  const lower = text.toLowerCase();
  return ASSISTANT_ALIASES.some((a) => lower.includes(a));
}

export function createRecognizer(
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  onError?: (msg: string) => void,
  onEnd?: () => void,
): { start: () => void; stop: () => void } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const vp = loadVoicePrefs();
  const rec = new Ctor();
  rec.lang = vp.sttLang || "hr-HR";
  rec.continuous = vp.continuous;
  rec.interimResults = true;
  rec.maxAlternatives = 3;

  // Skupljamo SAMO nove rezultate od resultIndex nadalje da se tekst
  // ne slaže naopako ni duplo (uzrok "odgovara unatrag").
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const txt = r[0]?.transcript ?? "";
      if (r.isFinal) finalText += (finalText ? " " : "") + txt.trim();
      else interim += txt;
    }
    const preview = (finalText + " " + interim).trim();
    if (preview) onPartial(normalizeHeard(preview));
  };
  rec.onerror = (e) => {
    const err = String((e as { error?: string }).error ?? "greška");
    const hr: Record<string, string> = {
      "no-speech": "Nisam čula ništa — probaj ponovno.",
      "not-allowed": "Mikrofon je blokiran u pregledniku.",
      "audio-capture": "Ne vidim mikrofon.",
      network: "Prepoznavanje govora nema mrežu.",
      aborted: "",
    };
    const msg = hr[err] ?? err;
    if (msg) onError?.(msg);
  };
  rec.onend = () => {
    const t = normalizeHeard(finalText);
    finalText = "";
    if (t) onFinal(t);
    onEnd?.();
  };
  return {
    start: () => {
      finalText = "";
      rec.start();
    },
    stop: () => rec.stop(),
  };
}

let chosenVoice: SpeechSynthesisVoice | null = null;

const FEMALE_HINTS =
  /(female|zena|žena|woman|luna|matea|iva|ana|maja|petra|marta|zira|helena|natasa|nataša|milena|vesna|sonja|google hrvatski|srpski|zlata|lana|nina|ines|dora)/i;

function scoreVoice(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase();
  const name = v.name.toLowerCase();
  let s = 0;
  if (lang.startsWith("hr")) s += 100;
  else if (lang.startsWith("sr") || lang.startsWith("bs") || lang.startsWith("sl")) s += 60;
  else if (lang.startsWith("sk") || lang.startsWith("cs") || lang.startsWith("pl")) s += 20;
  if (FEMALE_HINTS.test(name)) s += 40;
  if (/male\b|muski|muški|marko|ivan|david|george/.test(name) && !/female/.test(name)) s -= 25;
  if (/google/.test(name)) s += 15; // Googleovi glasovi zvuče prirodnije
  if (/natural|neural|online/.test(name)) s += 25;
  return s;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const uri = loadVoicePrefs().voiceURI;
  if (uri) {
    const exact = voices.find((v) => v.voiceURI === uri);
    if (exact) return exact;
  }
  const candidates = voices
    .map((v) => ({ v, s: scoreVoice(v) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return candidates[0]?.v ?? null;
}

export function warmUpVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    chosenVoice = pickVoice();
  };
  chosenVoice = pickVoice();
}

export function currentVoiceName(): string {
  return (chosenVoice ?? pickVoice())?.name ?? "sistemski glas";
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>~|]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/·/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

// Chrome puca na dugim tekstovima — dijelimo na rečenice i redamo ih.
function chunk(text: string, max = 180): string[] {
  const parts = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + " " + p).trim().length > max) {
      if (buf) out.push(buf.trim());
      buf = p;
    } else {
      buf = (buf + " " + p).trim();
    }
  }
  if (buf) out.push(buf.trim());
  return out.length ? out : [text];
}

export function speak(text: string, onEnd?: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const vp = loadVoicePrefs();
  chosenVoice = pickVoice();
  const voice = chosenVoice;
  const pieces = chunk(cleanForSpeech(text));
  pieces.forEach((piece, i) => {
    const u = new SpeechSynthesisUtterance(piece);
    u.lang = voice?.lang ?? vp.sttLang ?? "hr-HR";
    u.rate = vp.rate;
    u.pitch = vp.pitch;
    u.volume = vp.volume;
    if (voice) u.voice = voice;
    if (i === pieces.length - 1) u.onend = () => onEnd?.();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
