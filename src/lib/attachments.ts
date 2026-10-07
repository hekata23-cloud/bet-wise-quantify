// Obrada uploada u chatu: slike (bilo koji format), tekstualne/kodne datoteke,
// ZIP arhive (raspakiravanje u pregledniku), i cijele mape (webkitdirectory).
import JSZip from "jszip";

export interface ChatAttachment {
  id: string;
  kind: "image" | "text" | "binary";
  name: string;
  path: string; // relativna putanja (npr. iz foldera/zipa)
  size: number;
  mime: string;
  // Za slike: data URL (base64) za slanje Gemini modelu i prikaz.
  dataUrl?: string;
  // Za tekst: raw sadržaj.
  text?: string;
}

const TEXT_EXT = new Set([
  "txt","md","markdown","json","jsonc","yaml","yml","toml","xml","csv","tsv",
  "ts","tsx","js","jsx","mjs","cjs","css","scss","less","html","htm","svg",
  "py","rb","go","rs","java","kt","kts","swift","php","c","h","cpp","hpp",
  "cs","sh","bash","zsh","ps1","sql","env","conf","ini","log","gitignore",
  "prettierrc","eslintrc","dockerfile","makefile","lock",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function looksTextual(name: string, mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("yaml")
  )
    return true;
  return TEXT_EXT.has(extOf(name));
}

function looksImage(mime: string, name: string): boolean {
  if (mime.startsWith("image/")) return true;
  const e = extOf(name);
  return ["png","jpg","jpeg","webp","gif","bmp","heic","heif","avif","svg"].includes(e);
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error("FileReader greška"));
    r.onload = () => resolve(String(r.result ?? ""));
    r.readAsDataURL(file);
  });
}

function blobToText(file: Blob): Promise<string> {
  return file.text();
}

const MAX_TEXT = 40_000; // po datoteci, kliramo AI kontekst
const MAX_FILES = 40;

function truncateText(t: string): string {
  if (t.length <= MAX_TEXT) return t;
  return t.slice(0, MAX_TEXT) + `\n\n… [odrezano na ${MAX_TEXT} znakova od ${t.length}]`;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function processSingle(
  file: Blob,
  name: string,
  path: string,
): Promise<ChatAttachment[]> {
  const mime = file.type || "";
  // ZIP -> raspakiraj rekurzivno
  if (
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    name.toLowerCase().endsWith(".zip")
  ) {
    const zip = await JSZip.loadAsync(file);
    const out: ChatAttachment[] = [];
    const entries = Object.values(zip.files).filter((f) => !f.dir);
    for (const e of entries) {
      if (out.length >= MAX_FILES) break;
      const blob = await e.async("blob");
      const subs = await processSingle(blob, e.name.split("/").pop() ?? e.name, e.name);
      out.push(...subs);
    }
    return out;
  }
  if (looksImage(mime, name)) {
    const dataUrl = await fileToDataUrl(file);
    return [
      {
        id: randomId(),
        kind: "image",
        name,
        path,
        size: file.size,
        mime: mime || "image/*",
        dataUrl,
      },
    ];
  }
  if (looksTextual(name, mime)) {
    const t = await blobToText(file);
    return [
      {
        id: randomId(),
        kind: "text",
        name,
        path,
        size: file.size,
        mime: mime || "text/plain",
        text: truncateText(t),
      },
    ];
  }
  return [
    {
      id: randomId(),
      kind: "binary",
      name,
      path,
      size: file.size,
      mime: mime || "application/octet-stream",
    },
  ];
}

export async function processUploads(files: FileList | File[]): Promise<ChatAttachment[]> {
  const arr = Array.from(files);
  const out: ChatAttachment[] = [];
  for (const f of arr) {
    if (out.length >= MAX_FILES) break;
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const subs = await processSingle(f, f.name, rel);
    out.push(...subs);
    if (out.length >= MAX_FILES) break;
  }
  return out.slice(0, MAX_FILES);
}

// Sažetak koji ide u tekst prompt (za sve vrste — slike se dodaju posebno kao inline_data)
export function attachmentsContextText(atts: ChatAttachment[]): string {
  if (!atts.length) return "";
  const lines: string[] = ["### KORISNIKOV UPLOAD (analiziraj sve)"];
  const texts = atts.filter((a) => a.kind === "text");
  const images = atts.filter((a) => a.kind === "image");
  const bins = atts.filter((a) => a.kind === "binary");
  if (images.length) {
    lines.push(`Slike (${images.length}): ${images.map((i) => i.path).join(", ")} — priložene su vizualno, opiši/analiziraj ih.`);
  }
  if (bins.length) {
    lines.push(
      `Binarne datoteke (${bins.length}): ${bins.map((b) => `${b.path} (${b.mime}, ${b.size}B)`).join(", ")} — sadržaj nedostupan, komentiraj samo metapodatke.`,
    );
  }
  for (const t of texts) {
    lines.push(`\n--- FILE: ${t.path} (${t.mime}) ---\n${t.text}\n--- END ${t.path} ---`);
  }
  return lines.join("\n");
}