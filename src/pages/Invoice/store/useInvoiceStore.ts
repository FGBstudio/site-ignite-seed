import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Invoice,
  DaEmettere,
  Sollecito,
  Bloccato,
  Insoluto,
  NotaCredito,
  CollectionKey,
} from "../types";
import { uid } from "../utils";

interface InvoiceState {
  invoices: Invoice[];
  daEmettere: DaEmettere[];
  solleciti: Sollecito[];
  bloccati: Bloccato[];
  insoluti: Insoluto[];
  nc: NotaCredito[];

  // generic CRUD
  upsertInvoice: (i: Omit<Invoice, "id"> & { id?: string }) => void;
  upsertDE: (i: Omit<DaEmettere, "id"> & { id?: string }) => void;
  upsertSO: (i: Omit<Sollecito, "id"> & { id?: string }) => void;
  upsertBL: (i: Omit<Bloccato, "id"> & { id?: string }) => void;
  upsertINS: (i: Omit<Insoluto, "id"> & { id?: string }) => void;
  upsertNC: (i: Omit<NotaCredito, "id"> & { id?: string }) => void;

  remove: (key: CollectionKey, id: string) => void;
}

export const useInvoiceStore = create<InvoiceState>()(
  persist(
    (set) => ({
      invoices: [],
      daEmettere: [],
      solleciti: [],
      bloccati: [],
      insoluti: [],
      nc: [],

      upsertInvoice: (i) =>
        set((s) => {
          const id = i.id ?? uid();
          const row = { ...i, id } as Invoice;
          const idx = s.invoices.findIndex((x) => x.id === id);
          const next = [...s.invoices];
          if (idx >= 0) next[idx] = row;
          else next.unshift(row);
          return { invoices: next };
        }),

      upsertDE: (i) =>
        set((s) => {
          const id = i.id ?? uid();
          const row = { ...i, id } as DaEmettere;
          const idx = s.daEmettere.findIndex((x) => x.id === id);
          const next = [...s.daEmettere];
          if (idx >= 0) next[idx] = row;
          else next.unshift(row);
          return { daEmettere: next };
        }),

      upsertSO: (i) =>
        set((s) => {
          const id = i.id ?? uid();
          const row = { ...i, id } as Sollecito;
          const idx = s.solleciti.findIndex((x) => x.id === id);
          const next = [...s.solleciti];
          if (idx >= 0) next[idx] = row;
          else next.unshift(row);
          return { solleciti: next };
        }),

      upsertBL: (i) =>
        set((s) => {
          const id = i.id ?? uid();
          const row = { ...i, id } as Bloccato;
          const idx = s.bloccati.findIndex((x) => x.id === id);
          const next = [...s.bloccati];
          if (idx >= 0) next[idx] = row;
          else next.unshift(row);
          return { bloccati: next };
        }),

      upsertINS: (i) =>
        set((s) => {
          const id = i.id ?? uid();
          const row = { ...i, id } as Insoluto;
          const idx = s.insoluti.findIndex((x) => x.id === id);
          const next = [...s.insoluti];
          if (idx >= 0) next[idx] = row;
          else next.unshift(row);
          return { insoluti: next };
        }),

      upsertNC: (i) =>
        set((s) => {
          const id = i.id ?? uid();
          const row = { ...i, id } as NotaCredito;
          const idx = s.nc.findIndex((x) => x.id === id);
          const next = [...s.nc];
          if (idx >= 0) next[idx] = row;
          else next.unshift(row);
          return { nc: next };
        }),

      remove: (key, id) =>
        set((s) => ({ [key]: (s[key] as Array<{ id: string }>).filter((r) => r.id !== id) }) as Partial<InvoiceState>),
    }),
    { name: "fgb-invoices-v1" }
  )
);
