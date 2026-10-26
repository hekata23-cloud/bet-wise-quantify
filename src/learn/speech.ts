// Browser speech helpers for the listening (text-to-speech) and shadowing
// (speech recognition) modules. Everything degrades gracefully when the
// browser exposes neither API.

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternative;
   length: number;
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isRecognitionSupported(): boolean {
  return !!recognitionCtor();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  if (!isSpeechSynthesisSupported()) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.split("-")[0];
  return (
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  );
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
}

/** Speak `text` in the given BCP-47 language. Resolves when playback ends. */
export function speak(text: string, lang: string, options: SpeakOptions = {}): Promise<void> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve();

  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = options.rate ?? 0.95;
    utterance.pitch = options.pitch ?? 1;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function cancelSpeech(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

/**
 * Listen to a single spoken utterance and resolve with the transcript.
 * Rejects when the API is missing, permission is denied, or nothing was heard.
 */
export function listenOnce(lang: string, timeoutMs = 9000): Promise<string> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.reject(new Error("Speech recognition is not supported in this browser."));

  return new Promise((resolve, reject) => {
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
      fn();
    };

    const timer = window.setTimeout(
      () => finish(() => reject(new Error("No speech detected — try again a little louder."))),
      timeoutMs,
    );

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript ?? "";
      finish(() => (transcript ? resolve(transcript) : reject(new Error("Nothing was recognised."))));
    };
    recognition.onerror = () => finish(() => reject(new Error("Microphone error — check permissions.")));
    recognition.onend = () => finish(() => reject(new Error("No speech detected.")));

    try {
      recognition.start();
    } catch {
      finish(() => reject(new Error("Could not start the microphone.")));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Comparison helpers                                                  */
/* ------------------------------------------------------------------ */

const PUNCTUATION = /[.,!?;:。、！？…、·"'«»()[\]{}—–-]/g;

/** Normalise a phrase for comparison, ignoring case, punctuation and spacing. */
export function normalizeText(text: string, lang: string): string {
  let out = text
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (lang === "ja" || lang === "ko" || lang === "zh") out = out.replace(/\s+/g, "");
  return out;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 0-1 similarity between what was said and the target phrase. */
export function similarity(target: string, said: string, lang: string): number {
  const a = normalizeText(target, lang);
  const b = normalizeText(said, lang);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
}

export interface PronunciationVerdict {
  label: string;
  tone: "success" | "warning" | "danger";
}

export function pronunciationVerdict(score: number): PronunciationVerdict {
  if (score >= 85) return { label: "Excellent — native-like", tone: "success" };
  if (score >= 65) return { label: "Good — minor slips", tone: "warning" };
  return { label: "Keep practising", tone: "danger" };
}
