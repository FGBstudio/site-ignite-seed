import { RawRow } from "../types";

/** Minimal RFC-4180-ish CSV parser supporting quoted fields. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        // skip
      } else {
        cur += c;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const REQUIRED = [
  "Electrical Panel",
  "To monitor",
  "Load Type",
  "Phase Configuration",
  "Current [A]",
  "Wire Dimensions",
];

export interface ParseResult {
  rows: RawRow[];
  warnings: string[];
}

export function parseSldCsv(text: string): ParseResult {
  const grid = parseCSV(text);
  if (grid.length === 0) throw new Error("Empty CSV file.");
  const headers = grid[0].map((h) => h.trim());
  const headerLower = headers.map((h) => h.toLowerCase());

  const missing = REQUIRED.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const idx = (name: string) => headers.indexOf(name);
  const idxCP = headerLower.indexOf("contemporary power");

  const rows: RawRow[] = [];
  const warnings: string[] = [];
  for (let r = 1; r < grid.length; r++) {
    const line = grid[r];
    const get = (i: number) => (i >= 0 && i < line.length ? line[i].trim() : "");
    const ampsRaw = get(idx("Current [A]"));
    const amps = ampsRaw === "" ? null : parseFloat(ampsRaw.replace(",", "."));
    const cpRaw = idxCP >= 0 ? get(idxCP) : "";
    const cp = cpRaw === "" ? null : parseFloat(cpRaw.replace(",", "."));
    rows.push({
      electricalPanel: get(idx("Electrical Panel")),
      toMonitor: get(idx("To monitor")),
      loadType: get(idx("Load Type")),
      phaseConfiguration: get(idx("Phase Configuration")),
      currentA: Number.isFinite(amps as number) ? (amps as number) : null,
      wireDimensions: get(idx("Wire Dimensions")),
      contemporaryPower: Number.isFinite(cp as number) ? (cp as number) : null,
    });
  }
  return { rows, warnings };
}
