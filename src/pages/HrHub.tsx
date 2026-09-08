import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { HR_PAGES } from "@/lib/hrPages";

export default function HrHub() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  // L'elenco sta in src/lib/hrPages.ts, lo stesso da cui la barra in alto
  // ricava il nome della pagina aperta: una copia sola, che non puo' divergere.
  const visible = HR_PAGES.filter((t) => !t.adminOnly || isAdmin);

  return (
    <MainLayout title="Human Resources" subtitle="Availability, requests, attendance">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {visible.map((t) => {
          const Icon = t.icon;
          return (
            <Card
              key={t.id}
              onClick={() => navigate(t.route)}
              className="p-6 cursor-pointer hover:shadow-lg transition-all backdrop-blur-md bg-card/70 border-border/60"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#f8cbcc]/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#911140]" />
                </div>
                <h3 className="text-sm font-medium tracking-wide uppercase">{t.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </Card>
          );
        })}
      </div>
    </MainLayout>
  );
}
