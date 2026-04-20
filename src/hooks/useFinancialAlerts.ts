import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays } from "date-fns";

export interface OverduePaymentItem {
  certId: string;
  name: string;
  client: string | null;
  daysOverdue: number;
  amount: number;
}

export interface ExtraCanoneItem {
  certId: string;
  name: string;
  client: string | null;
  title: string;
  createdAt: string;
}

export interface AwaitingInvoiceItem {
  certId: string;
  name: string;
  client: string | null;
  title: string;
  createdAt: string;
}

export interface FinancialAlertsResult {
  totalCount: number;
  overduePayments: {
    count: number;
    totalAmount: number;
    projects: OverduePaymentItem[];
  };
  extraCanone: {
    count: number;
    projects: ExtraCanoneItem[];
  };
  awaitingInvoice: {
    count: number;
    projects: AwaitingInvoiceItem[];
  };
  /** Map keyed by certification_id with per-project flags */
  byProject: Map<
    string,
    {
      name: string;
      paymentDelay: number; // max days overdue
      paymentAmount: number; // sum of overdue
      extraCanone: number; // count of open extra_canone alerts
      awaitingInvoice: number; // count of open billing_due alerts
    }
  >;
}

const EMPTY: FinancialAlertsResult = {
  totalCount: 0,
  overduePayments: { count: 0, totalAmount: 0, projects: [] },
  extraCanone: { count: 0, projects: [] },
  awaitingInvoice: { count: 0, projects: [] },
  byProject: new Map(),
};

/**
 * Aggregates "real" financial alerts:
 *  - Overdue payment milestones (cert_payment_milestones.status = 'Overdue')
 *  - Open Extra-Canone alerts (task_alerts.alert_type = 'extra_canone')
 * Scoped by role: ADMIN sees all, PM sees only own certifications.
 */
export function useFinancialAlerts() {
  const { user, role } = useAuth();
  const userId = user?.id;

  return useQuery<FinancialAlertsResult>({
    queryKey: ["financial-alerts", role, userId],
    enabled: !!userId && !!role,
    queryFn: async () => {
      // Resolve scope: cert IDs the user can see
      let scopedCertIds: string[] | null = null;
      if (role !== "ADMIN") {
        const { data: certs, error: cErr } = await supabase
          .from("certifications")
          .select("id")
          .eq("pm_id", userId!);
        if (cErr) throw cErr;
        scopedCertIds = (certs ?? []).map((c: any) => c.id);
        if (scopedCertIds.length === 0) return EMPTY;
      }

      // 1) Overdue payment milestones
      let payQ = (supabase as any)
        .from("cert_payment_milestones")
        .select("id, certification_id, amount, due_date, status, certifications!cert_payment_milestones_certification_id_fkey(id, name, client)")
        .eq("status", "Overdue");
      if (scopedCertIds) payQ = payQ.in("certification_id", scopedCertIds);
      const { data: payRows, error: pErr } = await payQ;
      if (pErr) throw pErr;

      // 2) Open Extra-Canone + Billing-Due alerts
      let alertQ = (supabase as any)
        .from("task_alerts")
        .select("id, certification_id, title, created_at, is_resolved, alert_type, certifications!task_alerts_certification_id_fkey(id, name, client)")
        .in("alert_type", ["extra_canone", "billing_due"])
        .eq("is_resolved", false);
      if (scopedCertIds) alertQ = alertQ.in("certification_id", scopedCertIds);
      const { data: alertRows, error: aErr } = await alertQ;
      if (aErr) throw aErr;

      const today = new Date();
      const byProject = new Map<
        string,
        { name: string; paymentDelay: number; paymentAmount: number; extraCanone: number; awaitingInvoice: number }
      >();

      // Aggregate overdue payments
      const overdueProjectsMap = new Map<string, OverduePaymentItem>();
      let totalAmount = 0;
      for (const row of (payRows ?? []) as any[]) {
        if (!row.due_date) continue;
        const days = differenceInDays(today, new Date(row.due_date));
        const amt = Number(row.amount) || 0;
        totalAmount += amt;
        const certName = row.certifications?.name || "—";
        const certClient = row.certifications?.client ?? null;

        const exMap = overdueProjectsMap.get(row.certification_id);
        if (!exMap) {
          overdueProjectsMap.set(row.certification_id, {
            certId: row.certification_id,
            name: certName,
            client: certClient,
            daysOverdue: days,
            amount: amt,
          });
        } else {
          exMap.amount += amt;
          if (days > exMap.daysOverdue) exMap.daysOverdue = days;
        }

        const ex = byProject.get(row.certification_id);
        if (!ex) {
          byProject.set(row.certification_id, {
            name: certName, paymentDelay: days, paymentAmount: amt, extraCanone: 0, awaitingInvoice: 0,
          });
        } else {
          ex.paymentAmount += amt;
          if (days > ex.paymentDelay) ex.paymentDelay = days;
        }
      }

      // Aggregate alerts (extra_canone + billing_due) — dedupe billing_due across PM/Admin duplicates
      const extraProjects: ExtraCanoneItem[] = [];
      const awaitingMap = new Map<string, AwaitingInvoiceItem>();
      for (const row of (alertRows ?? []) as any[]) {
        const certName = row.certifications?.name || "—";
        const certClient = row.certifications?.client ?? null;

        if (row.alert_type === "extra_canone") {
          extraProjects.push({
            certId: row.certification_id, name: certName, client: certClient,
            title: row.title || "Extra-Canone", createdAt: row.created_at,
          });
          const ex = byProject.get(row.certification_id);
          if (!ex) byProject.set(row.certification_id, { name: certName, paymentDelay: 0, paymentAmount: 0, extraCanone: 1, awaitingInvoice: 0 });
          else ex.extraCanone += 1;
        } else if (row.alert_type === "billing_due") {
          const key = `${row.certification_id}::${row.title}`;
          if (!awaitingMap.has(key)) {
            awaitingMap.set(key, {
              certId: row.certification_id, name: certName, client: certClient,
              title: row.title || "Billing Due", createdAt: row.created_at,
            });
            const ex = byProject.get(row.certification_id);
            if (!ex) byProject.set(row.certification_id, { name: certName, paymentDelay: 0, paymentAmount: 0, extraCanone: 0, awaitingInvoice: 1 });
            else ex.awaitingInvoice += 1;
          }
        }
      }

      const overdueProjects = Array.from(overdueProjectsMap.values()).sort((a, b) => b.daysOverdue - a.daysOverdue);
      const awaitingProjects = Array.from(awaitingMap.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      const result: FinancialAlertsResult = {
        totalCount: overdueProjects.length + extraProjects.length + awaitingProjects.length,
        overduePayments: { count: overdueProjects.length, totalAmount, projects: overdueProjects },
        extraCanone: { count: extraProjects.length, projects: extraProjects },
        awaitingInvoice: { count: awaitingProjects.length, projects: awaitingProjects },
        byProject,
      };
      return result;
    },
  });
}
