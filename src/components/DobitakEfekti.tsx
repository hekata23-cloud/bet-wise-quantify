// ============================================================
// DOBITAKEFEKTI.TSX — konfete + zvuk dobitka (bez vanjskih paketa)
// • pokreniKonfete(): elegantna canvas konfeta preko cijelog ekrana
// • svirajDobitak(): diskretni WebAudio zlatni zvuk (bez datoteka)
// • preklop "Efekti dobitka" (localStorage pc.efekti.dobitka, zadanouključeno)
// • EfektiDobitkaPanel: panel za Postavke; EfektiSwitch: mali preklop
// ============================================================
import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";

const KLJUC = "pc.efekti.dobitka";

export function efektiUkljuceno(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(KLJUC);
    return raw == null ? true : raw === "1";
  } catch {
    return true;
  }
}

export function spremiEfekte(ukljuceno: boolean) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KLJUC, ukljuceno ? "1" : "0");
      window.dispatchEvent(new CustomEvent("pc:efekti-dobitka"));
    }
  } catch {
    /* ignoriraj */
  }
}

/** Canvas konfeta — zlatno/crveno/bijele čestice, samočisti se nakon 2.6 s. */
export function pokreniKonfete(): void {
  if (typeof document === "undefined" || !efektiUkljuceno()) return;
  if (document.getElementById("pc-konfete")) return;
  const canvas = document.createElement("canvas");
  canvas.id = "pc-konfete";
  canvas.setAttribute(
    "style",
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999",
  );
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const BOJE = ["#fbbf24", "#f59e0b", "#e11d2e", "#ffffff", "#34d399"];
  const N = 140;
  const cestice = Array.from({ length: N }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.5,
    y: H * 0.35 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 8,
    w: 5 + Math.random() * 5,
    h: 8 + Math.random() * 8,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.3,
    boja: BOJE[Math.floor(Math.random() * BOJE.length)],
  }));
  const t0 = performance.now();
  let raf = 0;
  const korak = (t: number) => {
    const dt = t - t0;
    ctx.clearRect(0, 0, W, H);
    const alpha = dt > 2000 ? Math.max(0, 1 - (dt - 2000) / 600) : 1;
    ctx.globalAlpha = alpha;
    for (const c of cestice) {
      c.vy += 0.25; // gravitacija
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.vrot;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.boja;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (dt < 2600) raf = requestAnimationFrame(korak);
    else canvas.remove();
  };
  raf = requestAnimationFrame(korak);
  // sigurnosno čišćenje ako tab nije vidljiv
  setTimeout(() => {
    if (raf) cancelAnimationFrame(raf);
    canvas.remove();
  }, 3400);
}

/** Diskretni "zlatni" zvuk dobitka — WebAudio, bez audio datoteka. */
export function svirajDobitak(): void {
  if (!efektiUkljuceno()) return;
  try {
    const AudioCtor: typeof AudioContext | undefined =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioCtor) return;
    const ac = new AudioCtor();
    const tonovi = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    const t0 = ac.currentTime;
    tonovi.forEach((f, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.09 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.5);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0 + i * 0.09);
      osc.stop(t0 + i * 0.09 + 0.55);
    });
    setTimeout(() => void ac.close(), 1600);
  } catch {
    /* zvuk nije kritičan */
  }
}

/** Mali preklop za "Moji listići" stranica. */
export function EfektiSwitch() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(efektiUkljuceno());
    const h = () => setOn(efektiUkljuceno());
    window.addEventListener("pc:efekti-dobitka", h);
    return () => window.removeEventListener("pc:efekti-dobitka", h);
  }, []);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          spremiEfekte(e.target.checked);
        }}
        className="h-4 w-4"
      />
      Efekti dobitka: {on ? "Uključeno" : "Isključeno"}
    </label>
  );
}

/** Panel za Postavke — "Efekti dobitka: Uključeno/Isključeno" + isprobaj. */
export function EfektiDobitkaPanel() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(efektiUkljuceno());
  }, []);
  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PartyPopper className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-semibold">Efekti dobitka</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Kad listić iz "Moji listići" završi kao dobitan, izbaci elegantnu konfetu i diskretan zvuk.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              setOn(e.target.checked);
              spremiEfekte(e.target.checked);
            }}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Efekti dobitka: {on ? "Uključeno" : "Isključeno"}
            <span className="block text-xs text-muted-foreground">
              Konfeta + zvuk na novodobitnim listićima.
            </span>
          </span>
        </label>
        <button
          onClick={() => {
            pokreniKonfete();
            svirajDobitak();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
        >
          <PartyPopper className="h-4 w-4" /> Isprobaj efekte
        </button>
      </div>
    </section>
  );
}
