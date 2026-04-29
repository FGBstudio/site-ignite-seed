import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CTSettings, DEFAULT_SETTINGS, RawRow } from "../types";

interface PerCertState {
  settings: CTSettings;
  rawRows: RawRow[] | null;
  fileName: string | null;
  uploadedAt: string | null;
}

interface Store {
  byCert: Record<string, PerCertState>;
  getState: (certId: string) => PerCertState;
  setSettings: (certId: string, settings: CTSettings) => void;
  setData: (certId: string, rows: RawRow[], fileName: string) => void;
  clearData: (certId: string) => void;
}

const empty = (): PerCertState => ({
  settings: DEFAULT_SETTINGS,
  rawRows: null,
  fileName: null,
  uploadedAt: null,
});

export const useCTBuilderStore = create<Store>()(
  persist(
    (set, get) => ({
      byCert: {},
      getState: (certId) => get().byCert[certId] ?? empty(),
      setSettings: (certId, settings) =>
        set((s) => ({
          byCert: { ...s.byCert, [certId]: { ...(s.byCert[certId] ?? empty()), settings } },
        })),
      setData: (certId, rows, fileName) =>
        set((s) => ({
          byCert: {
            ...s.byCert,
            [certId]: {
              ...(s.byCert[certId] ?? empty()),
              rawRows: rows,
              fileName,
              uploadedAt: new Date().toISOString(),
            },
          },
        })),
      clearData: (certId) =>
        set((s) => ({
          byCert: {
            ...s.byCert,
            [certId]: { ...(s.byCert[certId] ?? empty()), rawRows: null, fileName: null, uploadedAt: null },
          },
        })),
    }),
    { name: "fgb-ct-builder-v1" },
  ),
);
