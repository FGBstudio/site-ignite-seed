import { useState } from "react";
import type { HubSection } from "@/lib/hubSections";

const FUTURA: React.CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

interface Props {
  section: HubSection;
  onClick: (section: HubSection) => void;
}

export function PittoCard({ section, onClick }: Props) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onClick(section)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex flex-col items-center gap-[.85rem] cursor-pointer select-none transition-opacity bg-transparent border-0 p-0"
      style={{ WebkitTapHighlightColor: "transparent" }}
      aria-label={section.name}
    >
      {/* Pittogramma + glow ring */}
      <div className="relative" style={{ width: 130, height: 130, flexShrink: 0 }}>
        <div
          className="absolute pointer-events-none transition-all duration-300"
          style={{
            inset: -8,
            borderRadius: "50%",
            border: `1.5px solid ${hover ? section.color : "transparent"}`,
            boxShadow: hover
              ? `0 0 22px color-mix(in srgb, ${section.color} 22%, transparent)`
              : "none",
          }}
        />
        <img
          src="/green_pittogramma.png"
          alt={section.name}
          className="w-full h-full object-contain"
          style={{
            filter: `${section.filter ? section.filter + " " : ""}drop-shadow(0 3px 10px rgba(0,0,0,.08))`,
            transform: hover ? "rotate(18deg) scale(1.13)" : "none",
            transformOrigin: "center",
            transition: "transform .45s cubic-bezier(.34,1.56,.64,1)",
            opacity: section.comingSoon ? 0.85 : 1,
          }}
        />
      </div>

      {/* Name + desc */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="transition-colors"
          style={{
            ...FUTURA,
            fontSize: 12,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            fontWeight: 500,
            color: hover ? section.color : "hsl(var(--foreground))",
            textAlign: "center",
          }}
        >
          {section.name}
        </div>
        <div
          className="text-muted-foreground text-center"
          style={{ fontSize: 11, lineHeight: 1.4, maxWidth: 130 }}
        >
          {section.desc}
        </div>
        {section.comingSoon && (
          <span
            className="mt-1 px-2 py-[2px] rounded-full"
            style={{
              ...FUTURA,
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: `color-mix(in srgb, ${section.color} 12%, transparent)`,
              color: section.color,
            }}
          >
            Coming soon
          </span>
        )}
      </div>
    </button>
  );
}
