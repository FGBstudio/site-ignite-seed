import {
  BomItem,
  CTModel,
  CTResult,
  CTSettings,
  DEFAULT_PRICES,
  ProcessedRow,
  RawRow,
} from "../types";

export function getSensorCountAndType(phase: string): { count: number; type: string } {
  const p = (phase || "").trim().toLowerCase();
  if (p === "mono") return { count: 1, type: "single" };
  if (p === "bi") return { count: 2, type: "double" };
  if (p === "tri") return { count: 3, type: "triphase" };
  return { count: 1, type: "unknown" };
}

export function parseWireDimension(wire: string | null | undefined): number {
  if (!wire) return 0;
  const matches = String(wire).match(/[-+]?\d*\.\d+|\d+/g);
  if (!matches || matches.length === 0) return 0;
  return parseFloat(matches[matches.length - 1]) || 0;
}

export function determineCTModel(amps: number, wireSqmm: number): CTModel {
  let ctAmp: CTModel;
  if (amps <= 63) ctAmp = "PAN-10";
  else if (amps <= 225) ctAmp = "PAN-12";
  else ctAmp = "PAN-14";

  let ctWire: CTModel;
  if (wireSqmm <= 35) ctWire = "PAN-10";
  else if (wireSqmm <= 240) ctWire = "PAN-12";
  else ctWire = "PAN-14";

  const rank: Record<CTModel, number> = { "PAN-10": 1, "PAN-12": 2, "PAN-14": 3 };
  return rank[ctWire] > rank[ctAmp] ? ctWire : ctAmp;
}

export function processRows(
  rows: RawRow[],
  settings: CTSettings,
  priceOverrides?: Partial<Record<string, number>>,
): CTResult {
  const PRICES: Record<string, number> = { ...DEFAULT_PRICES, ...(priceOverrides ?? {}) };
  const profileMap = new Map<string, { kc: number; hoursY: number }>();
  for (const lp of settings.loadProfiles) {
    profileMap.set(lp.use, { kc: lp.kcPct / 100, hoursY: lp.hours * lp.days });
  }
  // Aliases (matching Streamlit)
  if (!profileMap.has("Lighting") && profileMap.has("Light"))
    profileMap.set("Lighting", profileMap.get("Light")!);
  if (!profileMap.has("Plugs") && profileMap.has("Plug"))
    profileMap.set("Plugs", profileMap.get("Plug")!);

  const processed: ProcessedRow[] = rows.map((row) => {
    const sensorInfo = getSensorCountAndType(row.phaseConfiguration);
    const amps = row.currentA ?? 0;
    const profile = profileMap.get(row.loadType) ?? { kc: 0.6, hoursY: 1800 };
    let powerW = row.contemporaryPower;
    if (powerW == null) {
      const voltage = sensorInfo.type === "triphase" ? 692 : 230;
      powerW = amps * voltage * profile.kc;
    }
    const energyKWhY = (powerW * profile.hoursY * settings.pf) / 1000;
    const ctModel = determineCTModel(amps, parseWireDimension(row.wireDimensions));
    return {
      electricalPanel: row.electricalPanel,
      toMonitor: row.toMonitor,
      loadType: row.loadType,
      amps,
      powerW: Math.round(powerW * 10) / 10,
      energyKWhY: Math.round(energyKWhY * 10) / 10,
      ctModel,
      sensors: sensorInfo.count,
      hardwareCost: Math.round(PRICES[ctModel] * sensorInfo.count * 100) / 100,
      percentage: 0,
      isCritical: false,
    };
  });

  // Total facility energy: prefer rows where toMonitor contains "Main"
  const mainRows = processed.filter((r) => /main/i.test(r.toMonitor));
  let totalFacilityEnergy = mainRows.reduce((s, r) => s + r.energyKWhY, 0);
  if (totalFacilityEnergy === 0)
    totalFacilityEnergy = processed.reduce((s, r) => s + r.energyKWhY, 0);

  for (const r of processed) {
    r.percentage = totalFacilityEnergy > 0
      ? Math.round((r.energyKWhY / totalFacilityEnergy) * 10000) / 100
      : 0;
  }

  // Strategy
  if (settings.strategy === "individual") {
    for (const r of processed) r.isCritical = r.percentage > settings.threshold;
  } else {
    const groupTotals = new Map<string, number>();
    for (const r of processed) {
      groupTotals.set(r.loadType, (groupTotals.get(r.loadType) ?? 0) + r.percentage);
    }
    const criticalGroups = new Set(
      [...groupTotals.entries()].filter(([, v]) => v > settings.threshold).map(([k]) => k),
    );
    for (const r of processed) r.isCritical = criticalGroups.has(r.loadType);
  }

  const critical = processed.filter((r) => r.isCritical);
  const sensorCost = critical.reduce((s, r) => s + r.hardwareCost, 0);
  const totalSensors = critical.reduce((s, r) => s + r.sensors, 0);
  const bridgesNeeded = totalSensors > 0 ? Math.floor(totalSensors / 30) + 1 : 0;

  let infraCost = 0;
  if (settings.bridgeType === "LAN") infraCost = PRICES.BRIDGE_LAN * bridgesNeeded;
  else if (settings.bridgeType === "LTE") infraCost = PRICES.BRIDGE_LTE * bridgesNeeded;
  if (settings.useMango) infraCost += PRICES.MANGO;

  // BOM (only critical sensors are deployed)
  const bomMap = new Map<CTModel, number>();
  for (const r of critical) bomMap.set(r.ctModel, (bomMap.get(r.ctModel) ?? 0) + r.sensors);
  const bom: BomItem[] = [...bomMap.entries()].map(([model, qty]) => ({
    hardware: model,
    quantity: qty,
    unitCost: PRICES[model],
    totalCost: Math.round(PRICES[model] * qty * 100) / 100,
  }));
  if (settings.bridgeType !== "None" && bridgesNeeded > 0) {
    const key = settings.bridgeType === "LAN" ? "BRIDGE_LAN" : "BRIDGE_LTE";
    bom.push({
      hardware: `${settings.bridgeType} Bridge`,
      quantity: bridgesNeeded,
      unitCost: PRICES[key],
      totalCost: Math.round(PRICES[key] * bridgesNeeded * 100) / 100,
    });
  }
  if (settings.useMango) {
    bom.push({
      hardware: "MANGO Gateway",
      quantity: 1,
      unitCost: PRICES.MANGO,
      totalCost: PRICES.MANGO,
    });
  }

  return {
    rows: processed,
    totalFacilityEnergy,
    totalSensors,
    sensorCost: Math.round(sensorCost * 100) / 100,
    bridgesNeeded,
    infraCost: Math.round(infraCost * 100) / 100,
    totalProject: Math.round((sensorCost + infraCost) * 100) / 100,
    bom,
  };
}
