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
      <div className="max-w-[1440px] mx-auto px-6">
        <div className="pt-6 pb-2">
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <main className="pb-12">
          {children}
        </main>
      </div>
      {/* Global 7-day confirmation pop-up for PMs */}
      <PMConfirmationDialog />
    </div>
  );
}
