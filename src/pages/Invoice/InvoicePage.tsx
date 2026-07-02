import { useState } from "react";
import { TopNavbar } from "@/components/layout/TopNavbar";
import { useInvoiceStore } from "./store/useInvoiceStore";
import { fN } from "./utils";
import { KpiStrip } from "./components/KpiStrip";
import { TabBar, type TabKey } from "./components/TabBar";
import { IvaFab } from "./components/IvaFab";
import { InvoicesEmesse } from "./tabs/InvoicesEmesse";
import { InvoicesDaEmettere } from "./tabs/InvoicesDaEmettere";
import { InvoicesSolleciti } from "./tabs/InvoicesSolleciti";
import { InvoicesBloccati } from "./tabs/InvoicesBloccati";
import { InvoicesInsoluti } from "./tabs/InvoicesInsoluti";
import { InvoicesNoteCredito } from "./tabs/InvoicesNoteCredito";
import { PaymentsTasksPanel } from "./components/PaymentsTasksPanel";
import { QuotationsToInvoicePanel } from "./components/QuotationsToInvoicePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskAlerts } from "@/hooks/useTaskAlerts";

const FUTURA: React.CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

export default function InvoicePage() {
  const [tab, setTab] = useState<TabKey>("emesse");
  const { invoices, daEmettere, solleciti, bloccati, insoluti, nc } = useInvoiceStore();
  const { user, role } = useAuth();
  const { data: allAlerts = [] } = useTaskAlerts(role, user?.id);
  const paymentsTaskCount = allAlerts.filter(
    (a) =>
      !a.is_resolved &&
      ["quotation_to_payments", "billing_due", "extra_canone"].includes(a.alert_type)
  ).length;

  const totNotPaid = invoices.filter((r) => r.state !== "Paid").reduce((s, r) => s + (r.notPaid || 0), 0);
  const sollAttivi = solleciti.filter((r) => r.status !== "pagato").length;
  const ncDaFare = nc.filter((r) => r.status === "da_fare").length;

  return (
    <div className="min-h-screen bg-background">
      <TopNavbar />

      <header className="bg-card border-b border-border px-6 pt-5">
        <div className="max-w-[1400px] mx-auto">
          <h1
            className="text-foreground mb-4"
            style={{ ...FUTURA, fontSize: 20, letterSpacing: "0.09em", textTransform: "uppercase", fontWeight: 400 }}
          >
            Payments
          </h1>

          <KpiStrip
            items={[
              { label: "Tot. Insoluto", value: `€ ${fN(totNotPaid)}`, sub: "Da recuperare", variant: "alert", onClick: () => setTab("emesse") },
              { label: "Solleciti", value: sollAttivi, sub: "In recall", variant: "warn", onClick: () => setTab("solleciti") },
              { label: "Bloccati", value: bloccati.length, sub: "Da sbloccare", variant: "alert", onClick: () => setTab("bloccati") },
              { label: "Da emettere", value: daEmettere.length, sub: "Step pendenti", variant: "teal", onClick: () => setTab("da-emettere") },
              { label: "Note credito", value: ncDaFare, sub: "Rettifiche", variant: "warn", onClick: () => setTab("nc") },
            ]}
          />

          <TabBar
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "emesse", label: "Fatture Emesse", count: invoices.length, badge: "g" },
              { key: "quotations", label: "Quotations & Tranches", count: 0, badge: "t" },
              { key: "da-emettere", label: "Da Emettere", count: daEmettere.length, badge: "t" },
              { key: "solleciti", label: "Solleciti", count: sollAttivi, badge: "r" },
              { key: "bloccati", label: "Recall Bloccati", count: bloccati.length, badge: "r" },
              { key: "insoluti", label: "Insoluti", count: insoluti.length, badge: "r" },
              { key: "nc", label: "Note di Credito", count: nc.length, badge: "w" },
              { key: "tasks", label: "Tasks & Alerts", count: paymentsTaskCount, badge: paymentsTaskCount > 0 ? "r" : "g" },
            ]}
          />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {tab === "emesse" && <InvoicesEmesse />}
        {tab === "quotations" && <QuotationsToInvoicePanel />}
        {tab === "da-emettere" && <InvoicesDaEmettere />}
        {tab === "solleciti" && <InvoicesSolleciti />}
        {tab === "bloccati" && <InvoicesBloccati />}
        {tab === "insoluti" && <InvoicesInsoluti />}
        {tab === "nc" && <InvoicesNoteCredito />}
        {tab === "tasks" && <PaymentsTasksPanel />}
      </main>

      <IvaFab />
    </div>
  );
}
