import type { CSSProperties } from "react";

const FUTURA: CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

export type TabKey =
  | "emesse"
  | "da-emettere"
  | "solleciti"
  | "bloccati"
  | "insoluti"
  | "nc";

export interface TabDef {
  key: TabKey;
  label: string;
  count: number;
  badge: "g" | "r" | "w" | "t";
}

const BADGE: Record<TabDef["badge"], string> = {
  g: "bg-emerald-500/10 text-emerald-600",
  r: "bg-destructive/10 text-destructive",
  w: "bg-amber-500/10 text-amber-600",
  t: "bg-primary/10 text-primary",
};

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div className="flex border-b border-border bg-card overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-1.5 h-10 px-3.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              on
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground/70"
            }`}
            style={{
              ...FUTURA,
              fontSize: 10,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              background: "transparent",
            }}
          >
            {t.label}
            <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full ${BADGE[t.badge]}`}>
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
