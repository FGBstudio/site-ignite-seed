import { useState, type CSSProperties } from "react";

const FUTURA: CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

const ROWS = [
  { from: "FGB UK", to: "FGB UK", res: "+20% VAT" },
  { from: "FGB UK/IT", to: "Taiwan", res: "+20% (÷0.8)" },
  { from: "FGB UK/IT", to: "India / ME", res: "+5% (÷0.95)" },
  { from: "FGB UK", to: "Europa", res: "No IVA" },
  { from: "FGB Italy", to: "Mondo", res: "IVA + e-fattura" },
];

export function IvaFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="IVA / Tax cheat sheet"
        className="fixed bottom-6 right-6 z-40 w-[42px] h-[42px] rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg transition-all hover:scale-110"
      >
        <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx={12} cy={12} r={10} />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1={12} y1={17} x2={12.01} y2={17} />
        </svg>
      </button>
      {open && (
        <div
          className="fixed bottom-20 right-6 z-40 w-[310px] bg-card border-[0.5px] border-border rounded-xl shadow-xl p-5"
          style={{ animation: "fadeIn .2s ease" }}
        >
          <div
            className="flex justify-between items-center mb-3 text-foreground"
            style={{ ...FUTURA, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            Casistiche IVA / Tax
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-base">
              ✕
            </button>
          </div>
          {ROWS.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-background mb-1.5 text-xs">
              <span className="text-foreground/70 font-medium min-w-[68px]">{r.from}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground/70 flex-1">{r.to}</span>
              <span className="font-semibold text-primary whitespace-nowrap">{r.res}</span>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            ⚠ Per FGB Italy verificare fatturazione elettronica nazionale
          </p>
        </div>
      )}
    </>
  );
}
