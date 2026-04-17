import { ReactNode } from "react";
import { TopNavbar } from "./TopNavbar";
import { PMConfirmationDialog } from "@/components/dashboard/PMConfirmationDialog";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-background">
      <TopNavbar />

      {/* ── Page header: Gestionale fat-hdr style ── */}
      <div
        className="bg-card border-b sticky top-[52px] z-30"
        style={{ borderBottomColor: "hsl(var(--border))", borderBottomWidth: "0.5px" }}
      >
        <div className="max-w-[1440px] mx-auto px-6 py-4">
          {/* Title: Futura uppercase (Gestionale fat-sec-title) */}
          <h1
            className="text-[18px] text-foreground leading-none mb-0.5"
            style={{
              fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="text-[12px] text-muted-foreground mt-1"
              style={{ fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.01em", textTransform: "none" }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* ── Main content: avorio background ── */}
      <div className="max-w-[1440px] mx-auto px-6">
        <main className="py-6 pb-12">
          {children}
        </main>
      </div>

      {/* Global 7-day confirmation pop-up for PMs */}
      <PMConfirmationDialog />
    </div>
  );
}
