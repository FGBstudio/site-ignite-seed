import { useNavigate } from "react-router-dom";
import { TopNavbar } from "@/components/layout/TopNavbar";
import type { HubSection } from "@/lib/hubSections";
import { ArrowLeft } from "lucide-react";

const FUTURA: React.CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

interface Props {
  section: HubSection;
}

export default function ComingSoon({ section }: Props) {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "hsl(var(--background))" }}
    >
      <TopNavbar />

      <main
        className="mx-auto flex flex-col items-center justify-center text-center"
        style={{
          maxWidth: 720,
          padding: "5rem 2rem 4rem",
          minHeight: "calc(100vh - 52px)",
        }}
      >
        {/* Pittogramma colorato (grande, opacità ridotta) */}
        <img
          src="/green.png"
          alt={section.name}
          style={{
            width: 120,
            height: 120,
            objectFit: "contain",
            filter: `${section.filter ? section.filter + " " : ""}drop-shadow(0 3px 10px rgba(0,0,0,.06))`,
            opacity: 0.7,
            marginBottom: "1.75rem",
          }}
        />

        <h1
          className="text-foreground"
          style={{
            ...FUTURA,
            fontSize: 28,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 400,
            marginBottom: ".6rem",
          }}
        >
          {section.name}
        </h1>

        <p className="text-muted-foreground mb-2" style={{ fontSize: 14 }}>
          {section.desc}
        </p>

        <span
          className="mt-4 px-3 py-1 rounded-full"
          style={{
            ...FUTURA,
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: `color-mix(in srgb, ${section.color} 14%, transparent)`,
            color: section.color,
          }}
        >
          Coming soon — next release
        </span>

        <button
          onClick={() => navigate("/")}
          className="mt-10 inline-flex items-center gap-2 transition-colors hover:bg-muted/50"
          style={{
            ...FUTURA,
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "8px 16px",
            border: "0.5px solid hsl(var(--border))",
            borderRadius: 8,
            background: "hsl(var(--card))",
            color: "hsl(var(--foreground))",
            cursor: "pointer",
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
          Back to home
        </button>
      </main>
    </div>
  );
}
