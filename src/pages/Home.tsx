import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TopNavbar } from "@/components/layout/TopNavbar";
import { PittoCard } from "@/components/home/PittoCard";
import { HUB_SECTIONS, getGreeting, type HubSection } from "@/lib/hubSections";

const FUTURA: React.CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

export default function Home() {
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const [greeting, setGreeting] = useState(getGreeting());
  const transitionRef = useRef<HTMLDivElement>(null);

  // Refresh greeting every minute
  useEffect(() => {
    const id = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Filter sections by role
  const visibleSections = HUB_SECTIONS.filter((s) =>
    role ? s.allowedRoles.includes(role) : false
  );

  const firstName =
    profile?.full_name?.split(" ")[0] ||
    profile?.email?.split("@")[0] ||
    "";

  const handleNavigate = (section: HubSection) => {
    // Burst animation: a coloured circle scales up from the centre, then navigate.
    const el = transitionRef.current;
    if (!el) {
      navigate(section.route);
      return;
    }
    el.style.transition = "none";
    el.style.background = section.color;
    el.style.transform = "scale(0)";
    el.style.opacity = "0";
    // force reflow
    void el.getBoundingClientRect();
    el.style.transition =
      "transform .5s cubic-bezier(.4,0,.2,1), opacity .5s ease";
    el.style.transform = "scale(7)";
    el.style.opacity = "1";

    window.setTimeout(() => {
      navigate(section.route);
      // Fade out after navigation
      window.setTimeout(() => {
        if (!el) return;
        el.style.transition = "opacity .3s ease";
        el.style.opacity = "0";
      }, 50);
    }, 380);
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "hsl(var(--background))" }}
    >
      <TopNavbar />

      {/* Burst-transition overlay */}
      <div
        ref={transitionRef}
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 200,
          opacity: 0,
          transform: "scale(0)",
          borderRadius: "50%",
          background: "hsl(var(--primary))",
        }}
      />

      <main
        className="mx-auto"
        style={{
          maxWidth: 1000,
          padding: "3.5rem 2rem 4rem",
          minHeight: "calc(100vh - 52px)",
        }}
      >
        {/* Greeting */}
        <div
          className="text-muted-foreground"
          style={{
            ...FUTURA,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            marginBottom: ".4rem",
          }}
        >
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </div>

        {/* Big title */}
        <h1
          className="text-foreground"
          style={{
            ...FUTURA,
            fontSize: "clamp(26px,4vw,42px)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            lineHeight: 1.15,
            fontWeight: 400,
            marginBottom: "3rem",
          }}
        >
          MANAGEMENT TOOL
          <br />
          <span style={{ color: "#009193" }}>FGB STUDIO</span>
        </h1>

        {/* Pittogrammi grid */}
        <div className="flex flex-wrap justify-center items-start" style={{ gap: "2.5rem 3rem" }}>
          {visibleSections.map((s) => (
            <PittoCard key={s.id} section={s} onClick={handleNavigate} />
          ))}
        </div>
      </main>
    </div>
  );
}
