import type { Currency, Invoice } from "./types";

const CURRENCY_SYMBOL: Record<Currency, string> = {
  EUR: "€",
  GBP: "£",
  USD: "$",
  CHF: "CHF",
  JPY: "¥",
  TWD: "NT$",
  HKD: "HK$",
};

export function fEur(n: number | string | null | undefined, currency?: Currency | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!num && num !== 0) return "—";
  const sym = CURRENCY_SYMBOL[(currency as Currency) || "EUR"] ?? "€";
  return `${sym} ${Math.round(Number(num)).toLocaleString("it-IT")}`;
}

export function fN(n: number): string {
  return Math.round(n).toLocaleString("it-IT");
}

export function fD(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function calcDPO(r: Pick<Invoice, "date" | "dateOfPayment">): string {
  if (!r.dateOfPayment || !r.date) return "—";
  const d1 = new Date(r.date);
  const d2 = new Date(r.dateOfPayment);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return "—";
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + "gg";
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Export an array of objects as CSV download. */
export function exportCSV<T extends object>(filename: string, rows: T[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function entityBadgeClass(entity?: string): string {
  if (entity === "FGB UK") return "bg-blue-50 text-blue-700";
  if (entity === "FGB Italy") return "bg-rose-50 text-rose-700";
  if (entity === "FGB China") return "bg-amber-50 text-amber-700";
  return "bg-muted text-muted-foreground";
}

export function isOverdue(inv: Invoice): boolean {
  if (!inv.dueDate || inv.state === "Paid") return false;
  const d = new Date(inv.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}
