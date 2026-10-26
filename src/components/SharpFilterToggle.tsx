import { useState } from "react";
import { useSharpFilter, SHARP_PRESETS, type SharpPreset } from "@/lib/sharp-filter";
import {
  Shield,
  Zap,
  SlidersHorizontal,
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

export function SharpFilterToggle() {
  const { settings, enabled, setEnabled, setPreset, updateSettings, resetSettings } =
    useSharpFilter();
  const [modalOpen, setModalOpen] = useState(false);

  const activePreset = SHARP_PRESETS[settings.preset];

  return (
    <>
      {/* Glavni prekidač i gumb u navigaciji */}
      <div className="flex items-center gap-1.5 bg-background/80 border border-border/80 rounded-xl p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            enabled
              ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.45)] ring-1 ring-emerald-400"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title="Uključi ili isključi Sharp Sindikat Filter"
        >
          {enabled ? (
            <Zap className="h-3.5 w-3.5 fill-current animate-pulse text-amber-300" />
          ) : (
            <Shield className="h-3.5 w-3.5 opacity-70" />
          )}
          <span>{enabled ? "SHARP FILTER: UKLJUČEN" : "SHARP FILTER: ISKLJUČEN"}</span>
          <span
            className={`h-2 w-2 rounded-full ${
              enabled ? "bg-emerald-200 animate-ping" : "bg-muted-foreground/40"
            }`}
          />
        </button>

        {/* Gumb za brza podešavanja i filtere */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-l border-border/40"
          title="Otvori profesionalne sindikatske filtere"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline font-medium">
            {activePreset ? activePreset.icon : "⚙️"} Filtri
          </span>
        </button>
      </div>

      {/* Modal s profesionalnim filtrima */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Zaglavlje modala */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Sharp Sindikat Profiler</h3>
                  <p className="text-xs text-muted-foreground">
                    Automatsko skeniranje i filtriranje tipova na svim karticama
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Glavni Master Switch u modalu */}
            <div
              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                enabled
                  ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                  : "bg-muted/30 border-border/60 text-muted-foreground"
              }`}
            >
              <div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>Status filtera:</span>
                  <span
                    className={enabled ? "text-emerald-400 font-bold" : "text-muted-foreground"}
                  >
                    {enabled ? "AKTIVAN NA SVIM KARTICAMA" : "ISKLJUČEN (STANDARDNI PRIKAZ)"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {enabled
                    ? "Svi tipovi prolaze stroge matematičke provjere sindikata."
                    : "Kliknite prekidač za aktivaciju institucionalnog filtriranja."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  enabled
                    ? "bg-emerald-600 text-white shadow-md hover:bg-emerald-500"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {enabled ? "ISKLJUČI" : "UKLJUČI"}
              </button>
            </div>

            {/* 4 Brza profila (Preseta) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Odabir profila sindikata
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(SHARP_PRESETS) as SharpPreset[]).map((key) => {
                  const p = SHARP_PRESETS[key];
                  const isSelected = settings.preset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreset(key)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-primary/15 border-primary text-foreground shadow-sm ring-1 ring-primary/40"
                          : "bg-muted/20 border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold flex items-center gap-1.5">
                          <span>{p.icon}</span>
                          <span>{p.name}</span>
                        </span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                      <span className="text-[11px] leading-tight opacity-80">{p.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ručno fino podešavanje parametara */}
            <div className="space-y-3.5 border-t border-border/60 pt-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Fino podešavanje filtara
                </span>
                <button
                  type="button"
                  onClick={resetSettings}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> Vrati zadano
                </button>
              </div>

              {/* Minimalna vjerojatnost */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span>Minimalna vjerojatnost prolaza:</span>
                  <span className="font-bold text-primary">
                    {(settings.minProb * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="85"
                  step="1"
                  value={settings.minProb * 100}
                  onChange={(e) => updateSettings({ minProb: parseFloat(e.target.value) / 100 })}
                  className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>40% (Fleksibilno)</span>
                  <span>65% (Sindikat)</span>
                  <span>85% (Ultra sigurno)</span>
                </div>
              </div>

              {/* Minimalni Value Edge (EV) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span>Minimalni matematički Value Edge (EV):</span>
                  <span
                    className={`font-bold ${
                      settings.minEV > 0 ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {settings.minEV > 0 ? "+" : ""}
                    {settings.minEV.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-3"
                  max="8"
                  step="0.5"
                  value={settings.minEV}
                  onChange={(e) => updateSettings({ minEV: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 h-1.5 bg-muted rounded-lg cursor-pointer"
                />
              </div>

              {/* Maksimalna marža kladionice */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span>Maksimalna dopuštena marža kladionice (Max Vig):</span>
                  <span className="font-bold text-foreground">
                    {settings.maxMargin.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="10"
                  step="0.5"
                  value={settings.maxMargin}
                  onChange={(e) => updateSettings({ maxMargin: parseFloat(e.target.value) })}
                  className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                />
                <div className="text-[10px] text-muted-foreground">
                  Odbacuje ponude gdje kladionica uzima lihvarsku maržu veću od odabrane.
                </div>
              </div>

              {/* Prekidači za Anti-Draw i Sakrivanje */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30 border border-border/40 cursor-pointer">
                  <div>
                    <span className="font-semibold block">
                      Anti-Draw Zaštita (Rizik neriješenog)
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Upozorava na favorita ako je vjerojatnost remija veća od 28%.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.antiDrawFilter}
                    onChange={(e) => updateSettings({ antiDrawFilter: e.target.checked })}
                    className="accent-primary h-4 w-4 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30 border border-border/40 cursor-pointer">
                  <div>
                    <span className="font-semibold block">
                      Strogo sakrij necertificirane tipove
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      U karticama prikazuje isključivo verificirane oklade.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.onlyCertified}
                    onChange={(e) => updateSettings({ onlyCertified: e.target.checked })}
                    className="accent-primary h-4 w-4 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Podnožje modala s gumbom za potvrdu */}
            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Sprema se lokalno u preglednik
              </span>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-md hover:bg-primary/90 transition-colors"
              >
                Spremi & Primijeni
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
