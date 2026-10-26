import { useEffect, useState } from "react";
import { Download, Smartphone, Check } from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Instalacija Andromeda AI na PC ili mobitel (Chrome/Edge/Brave PWA). */
export function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("Andromeda AI je uspješno instalirana.");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) {
      toast.info("Preglednik još nije spreman. Pokušaj preko izbornika (tri točkice) → „Instaliraj aplikaciju“.");
      return;
    }
    await deferred.prompt();
    const res = await deferred.userChoice;
    if (res.outcome === "accepted") {
      setInstalled(true);
      toast.success("Hvala što ste instalirali Andromeda AI!");
    }
    setDeferred(null);
  }

  return (
    <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone className="h-5 w-5 text-primary" /> Instaliraj Andromeda AI (PWA)
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Instalirajte aplikaciju na svoj PC ili mobitel. Andromeda AI radi u vlastitom prozoru, bez adresne trake i brže se pokreće.
      </p>
      <button
        onClick={() => void install()}
        disabled={installed}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        style={{ boxShadow: installed ? "none" : "var(--shadow-glow)" }}
      >
        {installed ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {installed ? "Aplikacija je instalirana" : "Instaliraj aplikaciju"}
      </button>
      <div className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upute za instalaciju:</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li><strong>Chrome / Edge (PC):</strong> Kliknite na ikonu instalacije u adresnoj traci ili ⋮ {"→"} „Instaliraj Andromeda AI“.</li>
          <li><strong>Android:</strong> Izbornik ⋮ {"→"} „Instaliraj aplikaciju“ ili „Dodaj na početni zaslon“.</li>
          <li><strong>iPhone (Safari):</strong> Kliknite „Podijeli“ (Share) {"→"} „Dodaj na početni zaslon“.</li>
          <li>Instalacija je dostupna samo na objavljenoj HTTPS verziji stranice.</li>
        </ul>
      </div>
    </section>
  );
}
