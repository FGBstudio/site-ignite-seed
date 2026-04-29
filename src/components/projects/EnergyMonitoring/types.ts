export type CTModel = "PAN-10" | "PAN-12" | "PAN-14";
export type BridgeType = "LAN" | "LTE" | "None";
export type Strategy = "individual" | "group";

export interface LoadProfile {
  use: string;
  kcPct: number; // 0-100
  hours: number;
  days: number;
}

export interface CTSettings {
  pf: number;
  threshold: number;
  loadProfiles: LoadProfile[];
  bridgeType: BridgeType;
  useMango: boolean;
  strategy: Strategy;
}

export interface RawRow {
  electricalPanel: string;
  toMonitor: string;
  loadType: string;
  phaseConfiguration: string;
  currentA: number | null;
  wireDimensions: string;
  contemporaryPower: number | null;
}

export interface ProcessedRow {
  electricalPanel: string;
  toMonitor: string;
  loadType: string;
  amps: number;
  powerW: number;
  energyKWhY: number;
  ctModel: CTModel;
  sensors: number;
  hardwareCost: number;
  percentage: number;
  isCritical: boolean;
}

export interface BomItem {
  hardware: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface CTResult {
  rows: ProcessedRow[];
  totalFacilityEnergy: number;
  totalSensors: number;
  sensorCost: number;
  bridgesNeeded: number;
  infraCost: number;
  totalProject: number;
  bom: BomItem[];
}

export const DEFAULT_PRICES: Record<string, number> = {
  "PAN-10": 104.3,
  "PAN-12": 104.3,
  "PAN-14": 104.3,
  BRIDGE_LAN: 237.3,
  BRIDGE_LTE: 307.3,
  MANGO: 38.0,
};

export const DEFAULT_LOAD_PROFILES: LoadProfile[] = [
  { use: "Main", kcPct: 80, hours: 10, days: 360 },
  { use: "Main (HVA)", kcPct: 70, hours: 8, days: 360 },
  { use: "Light", kcPct: 90, hours: 10, days: 360 },
  { use: "Plug", kcPct: 60, hours: 8, days: 360 },
  { use: "HVAC", kcPct: 70, hours: 8, days: 360 },
  { use: "Others", kcPct: 60, hours: 5, days: 360 },
];

export const DEFAULT_SETTINGS: CTSettings = {
  pf: 0.8,
  threshold: 10,
  loadProfiles: DEFAULT_LOAD_PROFILES,
  bridgeType: "LAN",
  useMango: true,
  strategy: "individual",
};
