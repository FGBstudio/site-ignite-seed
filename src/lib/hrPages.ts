import { Calendar, ClipboardList, ScanLine, QrCode, type LucideIcon } from "lucide-react";

/**
 * Le pagine della sezione HR, in un posto solo.
 *
 * Prima l'elenco viveva dentro HrHub e da nessun'altra parte: la barra in alto
 * non sapeva come si chiamasse la pagina aperta, e la briciola della sezione
 * era testo morto. Il risultato era che dentro una pagina HR l'unica cosa
 * cliccabile fosse "Home" — da cui la sensazione di finire sempre lì.
 */
export interface HrPage {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  route: string;
  /** Solo per gli amministratori. */
  adminOnly: boolean;
}

export const HR_PAGES: HrPage[] = [
  {
    id: "availability",
    title: "Availability",
    desc: "Shared team calendar",
    icon: Calendar,
    route: "/hr/availability",
    adminOnly: false,
  },
  {
    id: "requests",
    title: "Leave & Permits",
    desc: "Holidays, permits, travel",
    icon: ClipboardList,
    route: "/hr/requests",
    adminOnly: false,
  },
  {
    id: "attendance",
    title: "Attendance Log",
    desc: "Check-in / check-out records",
    icon: ScanLine,
    route: "/hr/attendance",
    adminOnly: false,
  },
  {
    id: "scanner",
    title: "QR Scanner",
    desc: "Manager only — open the kiosk",
    icon: QrCode,
    route: "/hr/scanner",
    adminOnly: true,
  },
];

/** Il titolo della pagina HR aperta, per la barra di navigazione. */
export function getHrPageTitle(pathname: string): string | null {
  return HR_PAGES.find((p) => p.route === pathname)?.title ?? null;
}
