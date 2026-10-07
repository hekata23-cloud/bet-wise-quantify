import { useServerFn } from "@tanstack/react-start";
import { ImageUp, Loader2 } from "lucide-react";
import { useState } from "react";

import { readOddsFromImage, type OcrResult } from "@/lib/odds-ocr.functions";

export function OddsScreenshot({ onRead }: { onRead: (r: OcrResult) => void }) {
  const read = useServerFn(readOddsFromImage);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg("Odaberi sliku (PNG ili JPG).");
    if (file.size > 5 * 1024 * 1024) return setMsg("Slika je prevelika (max 5 MB).");
    setBusy(true);
    setMsg("Čitam kvote sa slike…");
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      const res = await read({ data: { image } });
      if (!res.ok) return setMsg(res.message ?? "Nije uspjelo.");
      onRead(res);
      const missing = [!res.k22 && "2:2", !res.over && "Over 2.5", !res.gg && "GG"].filter(Boolean);
      setMsg(`Kvote upisane.${missing.length ? ` Nije pronađeno: ${missing.join(", ")} — upiši ručno.` : ""}`);
    } catch {
      setMsg("Čitanje slike nije uspjelo. Pokušaj ponovno.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-cyan/60 bg-surface/40 px-3 py-4 text-sm font-semibold text-cyan hover:bg-surface/70 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ImageUp className="size-5" />}
        Učitaj snimku zaslona s kvotama
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {msg && <p role="status" className="rounded-md border border-line bg-surface/40 px-3 py-2 text-xs font-semibold text-ink/85">{msg}</p>}
    </div>
  );
}
