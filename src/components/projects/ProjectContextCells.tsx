import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ProjectContextBase } from "@/types";

/**
 * Standardized CLIENT | CITY | PROJECT columns for every project-scoped
 * table in the app. Enforces the "context before content" ordering:
 * Who (Client) → Where (City) → What (Project Name).
 *
 * Data is read via Supabase relational join:
 *   .select("*, certifications ( client, name, sites ( city ) )")
 *
 * If the row already has flat `client` / `city` / `projectName` accessors,
 * pass them explicitly via the `fallback` prop.
 */

type CtxRow = ProjectContextBase & {
  client?: string | null;
  city?: string | null;
  projectName?: string | null;
  project_name?: string | null;
  name?: string | null;
};

function readClient(row: CtxRow): string {
  return row.certifications?.client || row.client || "—";
}
function readCity(row: CtxRow): string {
  return row.certifications?.sites?.city || row.city || "—";
}
function readProjectName(row: CtxRow): string {
  return (
    row.certifications?.name ||
    row.projectName ||
    row.project_name ||
    row.name ||
    "—"
  );
}

export function ProjectContextHeaders({ sticky = false }: { sticky?: boolean }) {
  const base = "font-semibold uppercase text-xs tracking-wide";
  const stickyCls = sticky ? "sticky left-0 bg-muted z-10" : "";
  return (
    <>
      <TableHead className={cn(base, stickyCls)}>Client</TableHead>
      <TableHead className={cn(base)}>City</TableHead>
      <TableHead className={cn(base)}>Project</TableHead>
    </>
  );
}

export function ProjectContextCells({
  row,
  sticky = false,
}: {
  row: CtxRow;
  sticky?: boolean;
}) {
  const stickyCls = sticky ? "sticky left-0 bg-background z-10" : "";
  return (
    <>
      <TableCell className={cn("font-semibold text-foreground uppercase", stickyCls)}>
        {readClient(row)}
      </TableCell>
      <TableCell className="text-muted-foreground uppercase">{readCity(row)}</TableCell>
      <TableCell className="text-foreground">{readProjectName(row)}</TableCell>
    </>
  );
}

export const projectContext = {
  client: readClient,
  city: readCity,
  projectName: readProjectName,
};
