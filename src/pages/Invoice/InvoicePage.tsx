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

const FUTURA: React.CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

export default function InvoicePage() {
  const [tab, setTab] = useState<TabKey>("emesse");
  const { invoices, daEmettere, solleciti, bloccati, insoluti, nc } = useInvoiceStore();

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
            Fatturazione
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
              { key: "da-emettere", label: "Da Emettere", count: daEmettere.length, badge: "t" },
              { key: "solleciti", label: "Solleciti", count: sollAttivi, badge: "r" },
              { key: "bloccati", label: "Recall Bloccati", count: bloccati.length, badge: "r" },
              { key: "insoluti", label: "Insoluti", count: insoluti.length, badge: "r" },
              { key: "nc", label: "Note di Credito", count: nc.length, badge: "w" },
            ]}
          />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {tab === "emesse" && <InvoicesEmesse />}
        {tab === "da-emettere" && <InvoicesDaEmettere />}
        {tab === "solleciti" && <InvoicesSolleciti />}
        {tab === "bloccati" && <InvoicesBloccati />}
        {tab === "insoluti" && <InvoicesInsoluti />}
        {tab === "nc" && <InvoicesNoteCredito />}
      </main>

      <IvaFab />
    </div>
  );
}
