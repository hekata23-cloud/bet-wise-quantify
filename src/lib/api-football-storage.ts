export type SavedKey = {
  key: string;
  active: boolean;
  savedAt: number;
  plan?: string;
  account?: string;
};

const STORAGE_KEY = "termometar.apifootball";

export function loadKey(): SavedKey | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedKey;
    if (!parsed || typeof parsed.key !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveKey(value: SavedKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function maskKey(key: string) {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
