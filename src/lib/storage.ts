// LocalStorage wrapper za API ključeve i postavke. Sve ostaje u pregledniku korisnika.
export type ApiKeyName =
  | "gemini"
  | "groq"
  | "apiFootball"
  | "openrouter"
  | "huggingface"
  | "nvidia"
  | "footballData";

const KEYS: Record<ApiKeyName, string> = {
  gemini: "tm.key.gemini",
  groq: "tm.key.groq",
  apiFootball: "tm.key.apiFootball",
  openrouter: "tm.key.openrouter",
  huggingface: "tm.key.huggingface",
  nvidia: "tm.key.nvidia",
  footballData: "tm.key.footballData",
};

export function getKey(name: ApiKeyName): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEYS[name]) ?? "";
}

export function setKey(name: ApiKeyName, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYS[name], value.trim());
}

export function clearKey(name: ApiKeyName): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEYS[name]);
}

export function hasKey(name: ApiKeyName): boolean {
  return getKey(name).length > 0;
}

// Generički JSON storage (za cache, povijest chata itd.)
export function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}