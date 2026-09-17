import { useMemo, useState } from "react";
import { FiltroUfficio } from "@/components/hr/FiltroUfficio";
import { nomePersona } from "@/lib/nomePersona";
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
  isSameMonth,
  isWeekend,
  startOfMonth,
} from "date-fns";
import type {
  AvailabilityStatus,
  HrAvailability as HrAvailabilityRow,
  MaskedStatus,
} from "@/hooks/useHr";
import {
  useDeleteAvailability,
  useHrAvailability,
  useHrProfiles,
  useUpsertAvailability,
} from "@/hooks/useHr";

import { useToast } from "@/hooks/use-toast";

// Etichette e sigle sono quelle del planning cartaceo dell'ufficio ("FGB ITA_
// Availability"), non una traduzione nostra: chi passa dal foglio all'app deve
// ritrovare le stesse lettere.
const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  office: "Office",
  smart_working: "Smart working",
  unavailable: "Unavailable",
  travel: "Business Travel",
  vacation: "Holidays",
  permit: "Personal Permit",
  sick: "Sick leave",
};
const STATUS_SHORT: Record<AvailabilityStatus, string> = {
  office: "O",
  smart_working: "S",
  unavailable: "U",
  travel: "T",
  vacation: "H",
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

// Di un collega si sa se c'e' o non c'e', non perche'. Due colori e nessuna
// lettera: una sigla suggerirebbe una causale che non stiamo mostrando.
const MASKED_COLOR: Record<MaskedStatus, string> = {
  available: "#9FD5D9",
  unavailable: "#CBD5D5",
};
const MASKED_LABEL: Record<MaskedStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
};

/** Come va disegnata una casella per chi la sta guardando. */
interface CellView {
  color: string;
  letter: string;
  title: string;
  faded: boolean;
}

const HIDDEN: CellView = {
  color: "transparent",
  letter: "",
  title: "Di un collega si vede solo il mese corrente",
  faded: true,
};

function cellView(
  cell: HrAvailabilityRow | undefined,
  weekend: boolean,
  revealed: boolean,
  currentMonth: boolean
): CellView | null {
  if (cell && !cell.masked) {
    const s = cell.status as AvailabilityStatus;
    return {
      color: STATUS_COLOR[s],
      letter: STATUS_SHORT[s],
      title: `${STATUS_LABEL[s]}${cell.note ? ` — ${cell.note}` : ""}`,
      faded: false,
    };
  }
  if (cell) {
    const s = cell.status as MaskedStatus;
    return { color: MASKED_COLOR[s], letter: "", title: MASKED_LABEL[s], faded: false };
  }
  if (weekend) return null;

  // Nessuna riga salvata. Su di sé e da amministratore vuol dire "in ufficio",
  // che e' il default del foglio cartaceo. Su un collega fuori dal mese
  // corrente non vuol dire niente: il dato non e' assente, e' non visibile, e
  // disegnarlo come "disponibile" direbbe una cosa che non sappiamo.
  if (revealed) {
    return {
      color: STATUS_COLOR.office,
      letter: STATUS_SHORT.office,
      title: `${STATUS_LABEL.office} (default)`,
      faded: true,
    };
  }
  if (!currentMonth) return HIDDEN;
  return { color: MASKED_COLOR.available, letter: "", title: "Available (default)", faded: true };
}

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

  const { data: tutteLePersone = [] } = useHrProfiles();
  const [ufficio, setUfficio] = useState<string | null>(null);

  // Quante persone per ufficio: serve al filtro per sapere se ha senso
  // mostrarsi. Se nessuno e' assegnato, il filtro sparisce da solo.
  const perUfficio = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of tutteLePersone) {
      if (p.office_id) m.set(p.office_id, (m.get(p.office_id) ?? 0) + 1);
    }
    return m;
  }, [tutteLePersone]);

  const profiles = useMemo(
    () => (ufficio ? tutteLePersone.filter((p) => p.office_id === ufficio) : tutteLePersone),
    [tutteLePersone, ufficio]
  );
  const { data: avail = [] } = useHrAvailability(fromISO, toISO);
  const upsert = useUpsertAvailability();
  const del = useDeleteAvailability();

  const byKey = useMemo(() => {
    const m = new Map<string, HrAvailabilityRow>();
    avail.forEach((a) => m.set(`${a.user_id}|${a.date}`, a));
    return m;
  }, [avail]);

  const canEdit = (rowUserId: string) => isAdmin || rowUserId === user?.id;
  const currentMonth = isSameMonth(cursor, new Date());

  return (
    <MainLayout
      title="Availability"
      subtitle={
        isAdmin
          ? "Shared team calendar — you can edit anyone"
          : "Your calendar in full. Of your colleagues, available or not, current month only"
      }
    >
      {/* Il filtro porta con sé l'ora locale: chi guarda Shanghai da Milano
          deve sapere che lì la giornata è finita, non dedurlo da un calendario
          vuoto. */}
      <FiltroUfficio scelto={ufficio} onScegli={setUfficio} conteggi={perUfficio} className="mb-3" />

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
          {/* I due colori con cui si vedono i colleghi. Un amministratore non
              li incontra mai: legge tutto per esteso. */}
          {!isAdmin &&
            (Object.keys(MASKED_LABEL) as MaskedStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-1 text-muted-foreground">
                <span className="w-3 h-3 rounded" style={{ background: MASKED_COLOR[s] }} />
                {MASKED_LABEL[s]}
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
                  <div className="truncate font-medium">{nomePersona(p)}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{p.email}</div>
                </td>
                {days.map((d) => {
                  const key = `${p.id}|${format(d, "yyyy-MM-dd")}`;
                  const cell = byKey.get(key);
                  const editable = canEdit(p.id);
                  const weekend = isWeekend(d);
                  const view = cellView(cell, weekend, editable, currentMonth);
                  // Si modifica solo cio' che si vede per intero: una casella
                  // mascherata non ha nemmeno l'id per essere aggiornata.
                  const own = editable && !cell?.masked;
                  return (
                    <td key={key} className={`p-0.5 ${weekend ? "bg-muted/20" : ""}`}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={!own}
                            title={view?.title ?? ""}
                            className={`w-7 h-7 rounded text-[10px] font-semibold text-foreground/80 flex items-center justify-center transition-all ${
                              own
                                ? "cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-primary/40"
                                : "cursor-not-allowed opacity-60"
                            } ${view?.faded ? "opacity-70" : ""} ${view === HIDDEN ? "border border-dashed border-border" : ""}`}
                            style={{ background: view ? view.color : "hsl(var(--muted))" }}
                          >
                            {view?.letter ?? ""}
                          </button>
                        </PopoverTrigger>
                        {own && (
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
                                cell?.id
                                  ? async () => {
                                      try {
                                        await del.mutateAsync(cell.id!);
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
  // L'editor si apre solo su righe leggibili per intero; il controllo tiene
  // comunque il tipo onesto.
  const [status, setStatus] = useState<AvailabilityStatus>(
    cell && !cell.masked ? (cell.status as AvailabilityStatus) : "office"
  );
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
