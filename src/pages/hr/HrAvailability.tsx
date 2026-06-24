import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isWeekend,
  startOfMonth,
} from "date-fns";
import type { AvailabilityStatus, HrAvailability as HrAvailabilityRow } from "@/hooks/useHr";
import {
  useDeleteAvailability,
  useHrAvailability,
  useHrProfiles,
  useUpsertAvailability,
} from "@/hooks/useHr";

import { useToast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  office: "Office",
  smart_working: "Smart working",
  unavailable: "Unavailable",
  travel: "Business Travel",
  vacation: "Vacation / Holiday",
  permit: "Permit",
  sick: "Sick leave",
};
const STATUS_SHORT: Record<AvailabilityStatus, string> = {
  office: "O",
  smart_working: "S",
  unavailable: "U",
  travel: "T",
  vacation: "V",
  permit: "Pp",
  sick: "M",
};
const STATUS_COLOR: Record<AvailabilityStatus, string> = {
  office: "#FBBF24",       // amber
  smart_working: "#5EEAD4", // teal
  unavailable: "#A78BFA",   // violet
  travel: "#F9A8D4",        // pink
  vacation: "#34D399",      // green
  permit: "#60A5FA",        // blue
  sick: "#FB923C",          // orange
};

export default function HrAvailability() {
  const { user, isAdmin } = useAuth();
  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()));
  const { toast } = useToast();

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) }),
    [cursor]
  );
  const fromISO = format(startOfMonth(cursor), "yyyy-MM-dd");
  const toISO = format(endOfMonth(cursor), "yyyy-MM-dd");

  const { data: profiles = [] } = useHrProfiles();
  const { data: avail = [] } = useHrAvailability(fromISO, toISO);
  const upsert = useUpsertAvailability();
  const del = useDeleteAvailability();

  const byKey = useMemo(() => {
    const m = new Map<string, HrAvailabilityRow>();
    avail.forEach((a) => m.set(`${a.user_id}|${a.date}`, a));
    return m;
  }, [avail]);

  const canEdit = (rowUserId: string) => isAdmin || rowUserId === user?.id;

  return (
    <MainLayout title="Availability" subtitle="Shared team calendar — edit your row only (Managers edit anyone)">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-medium w-44 text-center">
            {format(cursor, "MMMM yyyy")}
          </div>
          <Button size="sm" variant="outline" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>
        <div className="flex gap-2 items-center text-xs">
          {(Object.keys(STATUS_LABEL) as AvailabilityStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </div>
          ))}
          {isAdmin && <Badge variant="secondary" className="ml-2">Manager mode</Badge>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/70 backdrop-blur-md">
        <table className="text-xs border-collapse">
          <thead className="bg-muted/40">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left font-medium w-56">Person</th>
              {days.map((d) => (
                <th
                  key={d.toISOString()}
                  className={`px-1 py-2 text-center font-normal w-9 ${isWeekend(d) ? "bg-muted/30" : ""}`}
                >
                  <div className="text-[10px] text-muted-foreground">{format(d, "EEE")[0]}</div>
                  <div>{format(d, "d")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/20">
                <td className="sticky left-0 z-10 bg-card/95 backdrop-blur-md px-3 py-2 w-56">
                  <div className="truncate font-medium">{p.full_name || p.email || "—"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{p.email}</div>
                </td>
                {days.map((d) => {
                  const key = `${p.id}|${format(d, "yyyy-MM-dd")}`;
                  const cell = byKey.get(key);
                  const editable = canEdit(p.id);
                  const weekend = isWeekend(d);
                  // Default visual for weekdays without a saved entry → Office
                  const displayStatus: AvailabilityStatus | null = cell
                    ? cell.status
                    : weekend
                      ? null
                      : "office";
                  return (
                    <td key={key} className={`p-0.5 ${weekend ? "bg-muted/20" : ""}`}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={!editable}
                            title={
                              cell
                                ? `${STATUS_LABEL[cell.status]}${cell.note ? ` — ${cell.note}` : ""}`
                                : displayStatus
                                  ? `${STATUS_LABEL[displayStatus]} (default)`
                                  : ""
                            }
                            className={`w-7 h-7 rounded text-[10px] font-semibold text-foreground/80 flex items-center justify-center transition-all ${
                              editable ? "cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-primary/40" : "cursor-not-allowed opacity-60"
                            } ${!cell && displayStatus ? "opacity-70" : ""}`}
                            style={{ background: displayStatus ? STATUS_COLOR[displayStatus] : "hsl(var(--muted))" }}
                          >
                            {displayStatus ? STATUS_SHORT[displayStatus] : ""}
                          </button>
                        </PopoverTrigger>
                        {editable && (
                          <PopoverContent className="w-72 p-3 pointer-events-auto" align="center">
                            <CellEditor
                              cell={cell}
                              userId={p.id}
                              date={format(d, "yyyy-MM-dd")}
                              onSave={async (input) => {
                                try {
                                  await upsert.mutateAsync(input);
                                  toast({ title: "Saved" });
                                } catch (e: any) {
                                  toast({ title: "Error", description: e.message, variant: "destructive" });
                                }
                              }}
                              onDelete={
                                cell
                                  ? async () => {
                                      try {
                                        await del.mutateAsync(cell.id);
                                        toast({ title: "Cleared" });
                                      } catch (e: any) {
                                        toast({ title: "Error", description: e.message, variant: "destructive" });
                                      }
                                    }
                                  : undefined
                              }
                            />
                          </PopoverContent>
                        )}
                      </Popover>
                    </td>
                  );
                })}
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} className="p-6 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}

function CellEditor({
  cell,
  userId,
  date,
  onSave,
  onDelete,
}: {
  cell?: HrAvailabilityRow;
  userId: string;
  date: string;
  onSave: (input: {
    user_id: string;
    date: string;
    status: AvailabilityStatus;
    note?: string | null;
    hours_planned?: number | null;
  }) => void;
  onDelete?: () => void;
}) {
  const [status, setStatus] = useState<AvailabilityStatus>(cell?.status ?? "office");
  const [note, setNote] = useState(cell?.note ?? "");
  const [hours, setHours] = useState<string>(cell?.hours_planned?.toString() ?? "");

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{date}</div>
      <Select value={status} onValueChange={(v) => setStatus(v as AvailabilityStatus)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as AvailabilityStatus[]).map((s) => (
            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        step="0.5"
        placeholder="Hours planned"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
      />
      <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <div className="flex justify-between gap-2">
        {onDelete ? (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        ) : <span />}
        <Button
          size="sm"
          onClick={() =>
            onSave({
              user_id: userId,
              date,
              status,
              note: note || null,
              hours_planned: hours ? Number(hours) : null,
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
