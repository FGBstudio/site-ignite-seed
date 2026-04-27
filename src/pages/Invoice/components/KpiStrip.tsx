import type { CSSProperties } from "react";

const FUTURA: CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

interface KpiItem {
  label: string;
  value: string | number;
  sub: string;
  variant: "alert" | "warn" | "ok" | "teal";
  onClick?: () => void;
}

const BORDER: Record<KpiItem["variant"], string> = {
  alert: "border-l-[3px] border-l-destructive",
  warn: "border-l-[3px] border-l-amber-500",
  ok: "border-l-[3px] border-l-emerald-500",
  teal: "border-l-[3px] border-l-primary",
};

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="flex flex-wrap gap-2.5 mb-4">
      {items.map((k, i) => (
        <button
          key={i}
          type="button"
          onClick={k.onClick}
          className={`bg-background border-[0.5px] border-border rounded-lg px-4 py-2.5 min-w-[128px] text-left cursor-pointer transition-colors hover:border-border ${BORDER[k.variant]}`}
        >
          <div
            className="text-muted-foreground"
            style={{
              ...FUTURA,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 3,
            }}
          >
            {k.label}
          </div>
          <div className="text-foreground" style={{ fontSize: 21, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {k.value}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 11, marginTop: 1 }}>
            {k.sub}
          </div>
        </button>
      ))}
    </div>
  );
}
