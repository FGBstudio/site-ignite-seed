// ── Hub sections (mockup Gestionale_v8.html) ────────────────────────────────
// Each pictogram uses /public/green.png and is tinted via CSS filter.
// Filter values are taken straight from the mockup's getFilterLight() map.

import type { AppRole } from "@/types/custom-tables";

export type HubSectionId =
  | "projects"
  | "quotations"
  | "office"
  | "hr"
  | "monitor"
  | "invoice";

export interface HubSection {
  id: HubSectionId;
  name: string;
  desc: string;
  color: string;            // brand color of the pictogram
  filter: string;           // CSS filter to apply to green.png to obtain `color`
  route: string;            // navigation target
  comingSoon: boolean;
  allowedRoles: AppRole[];
}

// ── Role-gated section access (predisposto per futuri sotto-ruoli) ──────────
export const OPERATIONS_ROLES: AppRole[] = ["ADMIN", "PM"];
export const QUOTATIONS_ROLES: AppRole[] = ["ADMIN"];
export const PAYMENTS_ROLES: AppRole[] = ["ADMIN"];

export const HUB_SECTIONS: HubSection[] = [
  {
    id: "projects",
    // Display name is overridden per-role in the UI (Admin → "Operations", PM → "Projects").
    name: "PROJECTS",
    desc: "Pipeline, progress and documentation",
    color: "#009193",
    filter: "",
    route: "/projects-hub",
    comingSoon: false,
    allowedRoles: OPERATIONS_ROLES,
  },
  {
    id: "quotations",
    name: "QUOTATIONS",
    desc: "Draft, approve and hand over to Operations",
    color: "#a0d5d6",
    filter: "brightness(1.1) saturate(.65)",
    route: "/quotations",
    comingSoon: false,
    allowedRoles: QUOTATIONS_ROLES,
  },
  {
    id: "office",
    name: "OFFICE",
    desc: "Inventory, tools, requests, travel",
    color: "#911140",
    filter: "sepia(1) saturate(4) hue-rotate(290deg) brightness(.65)",
    route: "/office",
    comingSoon: true,
    allowedRoles: ["ADMIN"],
  },
  {
    id: "hr",
    name: "HR",
    desc: "Availability, leave requests, attendance",
    color: "#f8cbcc",
    filter: "sepia(1) saturate(2) hue-rotate(300deg) brightness(1.4)",
    route: "/hr",
    comingSoon: false,
    allowedRoles: ["ADMIN", "PM"],
  },

  {
    id: "monitor",
    name: "MONITOR",
    desc: "KPIs, certifications, site progress",
    color: "#a0d5d6",
    filter: "brightness(1.1) saturate(.65)",
    route: "/monitor",
    comingSoon: false,
    allowedRoles: ["ADMIN"],
  },
  {
    id: "invoice",
    name: "PAYMENTS",
    desc: "Invoices, recall, unpaid, credit notes",
    color: "#e63f26",
    filter: "sepia(1) saturate(5) hue-rotate(322deg) brightness(.95)",
    route: "/invoice",
    comingSoon: false,
    allowedRoles: PAYMENTS_ROLES,
  },
];

/** Returns the label to display for a section, given the current user role. */
export function getSectionDisplayName(
  section: HubSection,
  role: AppRole | null
): string {
  if (section.id === "projects") {
    // Admin (and future Operations sub-role) sees "Operations"; everyone else "Projects".
    return role === "ADMIN" ? "OPERATIONS" : "PROJECTS";
  }
  return section.name;
}

export const PROJECTS_SECTION_PATHS = [
  "/projects-hub",
  "/projects",
  "/ceo-dashboard",
  "/admin-tasks",
  "/contacts",
  "/hardwares",
  "/inventory",
  "/supplier-orders",
  "/reports",
  "/settings",
  "/pm-portal",
  "/my-tasks",
  "/team-board",
  "/timesheet",
];

export const HR_SECTION_PATHS = [
  "/hr",
  "/hr/availability",
  "/hr/requests",
  "/hr/attendance",
  "/hr/scanner",
];

export function isInProjectsSection(pathname: string): boolean {
  return PROJECTS_SECTION_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function getSectionForPath(pathname: string): HubSection | null {
  return HUB_SECTIONS.find(
    (s) => s.route === pathname || pathname.startsWith(s.route + "/")
  ) ?? null;
}


export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
