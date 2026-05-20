import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTeams,
  useTeamMembers,
  useTeamSprints,
  useTeamTasks,
  useCreateTeam,
  useAddTeamMember,
  useCreateSprint,
  useUpdateSprint,
  useCreateTeamTask,
  useUpdateTeamTask,
  useDeleteTeamTask,
} from "@/hooks/useTeamBoard";
import { useAllUsers, useCertificationOptions } from "@/hooks/usePickerOptions";
import type {
  TeamTask,
  TeamTaskStatus,
  TeamTaskPriority,
} from "@/types/team-board";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Plus,
  Users,
  CalendarDays,
  Sparkles,
  Trash2,
  FolderKanban,
  X,
  StickyNote,
} from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_COLUMNS: { id: TeamTaskStatus; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const PRIORITY_COLORS: Record<TeamTaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/10 text-warning border-warning/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
};

interface ParsedQuickAdd {
  title: string;
  assigneeHint?: string;
  projectHint?: string;
  priority?: TeamTaskPriority;
}

function parseQuickAdd(raw: string): ParsedQuickAdd {
  let title = raw;
  let assigneeHint: string | undefined;
  let projectHint: string | undefined;
  let priority: TeamTaskPriority | undefined;

  const at = raw.match(/@(\w+)/);
  if (at) {
    assigneeHint = at[1].toLowerCase();
    title = title.replace(at[0], "").trim();
  }
  const hash = raw.match(/#(\w+)/);
  if (hash) {
    projectHint = hash[1].toLowerCase();
    title = title.replace(hash[0], "").trim();
  }
  const bang = raw.match(/!(low|medium|high|alta|media|bassa)/i);
  if (bang) {
    const map: Record<string, TeamTaskPriority> = {
      low: "low", bassa: "low",
      medium: "medium", media: "medium",
      high: "high", alta: "high",
    };
    priority = map[bang[1].toLowerCase()];
    title = title.replace(bang[0], "").trim();
  }
  return { title: title.trim(), assigneeHint, projectHint, priority };
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function TeamBoard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  // undefined = not yet chosen (auto-pick latest sprint); null = explicit "All sprints"; string = specific sprint
  const [selectedSprintId, setSelectedSprintId] = useState<string | null | undefined>();
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all"); // all | general | <id>
  const [quickAdd, setQuickAdd] = useState("");
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editingTask, setEditingTask] = useState<TeamTask | null>(null);

  // auto-select first team
  const effectiveTeamId = selectedTeamId ?? teams[0]?.id;

  const { data: members = [] } = useTeamMembers(effectiveTeamId);
  const { data: sprints = [] } = useTeamSprints(effectiveTeamId);
  // auto-pick latest sprint only on first load; once user picks "All sprints" (null) we respect it
  const effectiveSprintId: string | null =
    selectedSprintId === undefined ? (sprints[0]?.id ?? null) : selectedSprintId;
  const { data: tasks = [], isLoading: tasksLoading } = useTeamTasks(
    effectiveTeamId,
    effectiveSprintId
  );
  const { data: users = [] } = useAllUsers();
  const { data: certifications = [] } = useCertificationOptions();

  const createTeam = useCreateTeam();
  const addMember = useAddTeamMember(effectiveTeamId);
  const createSprint = useCreateSprint(effectiveTeamId);
  const updateSprint = useUpdateSprint(effectiveTeamId);
  const createTask = useCreateTeamTask();
  const updateTask = useUpdateTeamTask(effectiveTeamId);
  const deleteTask = useDeleteTeamTask(effectiveTeamId);

  const currentTeam = teams.find((t) => t.id === effectiveTeamId);
  const currentSprint = sprints.find((s) => s.id === effectiveSprintId);
  const isAllSprints = effectiveSprintId === null;
  const sprintsWithNotes = useMemo(
    () => sprints.filter((s) => (s.meeting_notes ?? "").trim().length > 0),
    [sprints]
  );

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssignee !== "all") {
        const ids = (t.assignees && t.assignees.length > 0) ? t.assignees : (t.assigned_to ? [t.assigned_to] : []);
        if (!ids.includes(filterAssignee)) return false;
      }
      if (filterProject === "general" && t.certification_id) return false;
      if (filterProject !== "all" && filterProject !== "general" && t.certification_id !== filterProject) return false;
      return true;
    });
  }, [tasks, filterAssignee, filterProject]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TeamTaskStatus, TeamTask[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of filteredTasks) map[t.status].push(t);
    return map;
  }, [filteredTasks]);

  // Quick add
  const handleQuickAdd = () => {
    if (!quickAdd.trim() || !effectiveTeamId) return;
    const parsed = parseQuickAdd(quickAdd);
    if (!parsed.title) return;

    let assigned_to: string | null = null;
    if (parsed.assigneeHint) {
      const match = members
        .map((m) => m.profile)
        .find((p) => p && (p.full_name?.toLowerCase().includes(parsed.assigneeHint!) || p.email?.toLowerCase().includes(parsed.assigneeHint!)));
      if (match) assigned_to = match.id;
    }

    let certification_id: string | null = null;
    if (parsed.projectHint) {
      const match = certifications.find((c) =>
        c.name.toLowerCase().includes(parsed.projectHint!) ||
        (c.client?.toLowerCase().includes(parsed.projectHint!) ?? false)
      );
      if (match) certification_id = match.id;
    }

    createTask.mutate(
      {
        team_id: effectiveTeamId,
        sprint_id: effectiveSprintId ?? null,
        certification_id,
        assigned_to,
        title: parsed.title,
        priority: parsed.priority,
      },
      {
        onSuccess: () => setQuickAdd(""),
      }
    );
  };

  // ── Empty state: no teams yet ────────────────────────────────────────────
  if (!teamsLoading && teams.length === 0) {
    return (
      <MainLayout title="Team Board" subtitle="Shared workspace for team meetings and cross-project tasks">
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-4">
            <Users className="h-12 w-12 text-muted-foreground mx-auto" />
            <div>
              <p className="text-lg font-medium">No team yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a work group to organise meetings and shared tasks.
              </p>
            </div>
            <Button onClick={() => setShowNewTeam(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create your first team
            </Button>
          </CardContent>
        </Card>
        <NewTeamDialog
          open={showNewTeam}
          onOpenChange={setShowNewTeam}
          onCreate={(payload) => createTeam.mutate(payload, { onSuccess: () => setShowNewTeam(false) })}
          pending={createTeam.isPending}
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Team Board" subtitle="Plan meetings, assign cross-project work, sync to project canvases">
      {/* ── Header controls ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={effectiveTeamId} onValueChange={(v) => { setSelectedTeamId(v); setSelectedSprintId(undefined); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => setShowNewTeam(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New team
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        <Select value={effectiveSprintId ?? "all"} onValueChange={(v) => setSelectedSprintId(v === "all" ? null : v)}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Sprint" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sprints</SelectItem>
            {sprints.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}{s.meeting_notes ? " · 📝" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => setShowNewSprint(true)} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> New sprint from meeting
        </Button>

        {currentSprint && (
          <Button variant="outline" size="sm" onClick={() => setShowNotes(true)} className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" /> Meeting notes
          </Button>
        )}

        <div className="flex-1" />

        <Button variant="ghost" size="sm" onClick={() => setShowMembers(true)} className="gap-1.5">
          <Users className="h-3.5 w-3.5" /> {members.length} member{members.length !== 1 ? "s" : ""}
        </Button>
      </div>

      {/* Suggestion banner when no sprint exists or last sprint is old */}
      {currentTeam && sprints.length === 0 && (
        <Card className="bg-primary/5 border-primary/20 mb-4">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm flex-1">
              Tip: create a sprint to group the tasks decided in this meeting and keep a written record.
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowNewSprint(true)}>
              Create sprint
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active sprint meeting notes preview */}
      {currentSprint?.meeting_notes && (
        <Card className="mb-4 bg-muted/30">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <StickyNote className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Meeting notes · {currentSprint.label}
              </p>
              <p className="text-sm whitespace-pre-wrap line-clamp-4">{currentSprint.meeting_notes}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowNotes(true)}>Edit</Button>
          </CardContent>
        </Card>
      )}

      {isAllSprints && sprintsWithNotes.length > 0 && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sprintsWithNotes.map((sprint) => (
            <Card
              key={sprint.id}
              className="bg-muted/30 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => {
                setSelectedSprintId(sprint.id);
                setShowNotes(true);
              }}
            >
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <StickyNote className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Meeting notes · {sprint.label}
                  </p>
                  <p className="text-sm whitespace-pre-wrap line-clamp-3">{sprint.meeting_notes}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Label className="text-xs text-muted-foreground">Filter:</Label>
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.profile?.full_name || m.profile?.email || "User"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tasks</SelectItem>
            <SelectItem value="general">General only</SelectItem>
            {certifications.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Quick add ────────────────────────────────────────────────── */}
      <Card className="mb-4 border-primary/30">
        <CardContent className="py-3 px-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary shrink-0" />
          <Input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
            placeholder="Quick add task… try '@mario find new hardware supplier #prada !high'"
            className="border-0 focus-visible:ring-0 px-0 shadow-none"
          />
          <Button size="sm" onClick={handleQuickAdd} disabled={!quickAdd.trim() || createTask.isPending}>
            Add
          </Button>
        </CardContent>
      </Card>

      {/* ── Kanban ───────────────────────────────────────────────────── */}
      {tasksLoading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUS_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              label={col.label}
              count={tasksByStatus[col.id].length}
              onDrop={(taskId) => updateTask.mutate({ id: taskId, status: col.id })}
            >
              {tasksByStatus[col.id].map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onClick={() => setEditingTask(t)}
                  onNavigateProject={() => t.certification_id && navigate(`/projects/${t.certification_id}`)}
                />
              ))}
            </KanbanColumn>
          ))}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────── */}
      <NewTeamDialog
        open={showNewTeam}
        onOpenChange={setShowNewTeam}
        onCreate={(payload) => createTeam.mutate(payload, { onSuccess: (t) => { setShowNewTeam(false); setSelectedTeamId(t.id); } })}
        pending={createTeam.isPending}
      />

      <NewSprintDialog
        open={showNewSprint}
        onOpenChange={setShowNewSprint}
        onCreate={(payload) => createSprint.mutate(payload, { onSuccess: (s) => { setShowNewSprint(false); setSelectedSprintId(s.id); } })}
        pending={createSprint.isPending}
      />

      <MembersSheet
        open={showMembers}
        onOpenChange={setShowMembers}
        teamId={effectiveTeamId}
        members={members}
        users={users}
        onAdd={(userId) => addMember.mutate({ userId })}
        onRemove={() => { /* delegated below */ }}
        canManage={!!user}
      />

      {currentSprint && (
        <NotesSheet
          open={showNotes}
          onOpenChange={setShowNotes}
          sprint={currentSprint}
          onSave={(notes) => updateSprint.mutate({ id: currentSprint.id, meeting_notes: notes })}
        />
      )}

      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          open={!!editingTask}
          onOpenChange={(o) => !o && setEditingTask(null)}
          members={members}
          certifications={certifications}
          onSave={(updates) => {
            updateTask.mutate({ id: editingTask.id, ...updates });
            setEditingTask(null);
          }}
          onDelete={() => {
            if (confirm("Delete this task?")) {
              deleteTask.mutate(editingTask.id);
              setEditingTask(null);
            }
          }}
        />
      )}
    </MainLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components

function KanbanColumn({
  label,
  count,
  children,
  onDrop,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  onDrop: (taskId: string) => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
      className="bg-muted/30 rounded-lg p-2 min-h-[200px]"
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function TaskCard({
  task,
  onClick,
  onNavigateProject,
}: {
  task: TeamTask;
  onClick: () => void;
  onNavigateProject: () => void;
}) {
  return (
    <Card
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      onClick={onClick}
      className="cursor-pointer hover:shadow-md transition-all"
    >
      <CardContent className="p-3 space-y-2">
        <p className="text-sm font-medium leading-tight">{task.title || task.task_name}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          {task.priority && (
            <Badge variant="outline" className={cn("text-[10px]", PRIORITY_COLORS[task.priority])}>
              {task.priority}
            </Badge>
          )}
          {task.certification ? (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 cursor-pointer hover:bg-primary/10"
              onClick={(e) => { e.stopPropagation(); onNavigateProject(); }}
            >
              <FolderKanban className="h-2.5 w-2.5" />
              {task.certification.name}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
              General
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {task.due_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {format(new Date(task.due_date), "dd MMM")}
              </span>
            )}
          </div>
          {(() => {
            const people = task.assignee_profiles && task.assignee_profiles.length > 0
              ? task.assignee_profiles
              : task.assignee ? [task.assignee] : [];
            if (people.length === 0) return null;
            const shown = people.slice(0, 3);
            const extra = people.length - shown.length;
            return (
              <div className="flex -space-x-1.5">
                {shown.map((p) => (
                  <Avatar key={p.id} className="h-5 w-5 ring-2 ring-background">
                    <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                      {initials(p.full_name || p.email)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {extra > 0 && (
                  <div className="h-5 w-5 rounded-full bg-muted text-[9px] text-muted-foreground flex items-center justify-center ring-2 ring-background">
                    +{extra}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}

function NewTeamDialog({
  open, onOpenChange, onCreate, pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (p: { name: string; description?: string; color?: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#009193");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>A work group that can hold sprints and tasks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Energy Squad" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Color</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-16 h-9 p-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || pending} onClick={() => onCreate({ name: name.trim(), description: description.trim() || undefined, color })}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSprintDialog({
  open, onOpenChange, onCreate, pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (p: { label: string; start_date?: string; end_date?: string; meeting_notes?: string }) => void;
  pending: boolean;
}) {
  const today = new Date();
  const [label, setLabel] = useState(`Meeting ${format(today, "dd MMM yyyy")}`);
  const [start, setStart] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sprint from meeting</DialogTitle>
          <DialogDescription>Group the tasks decided in this meeting and keep a written record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Meeting notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="What did we discuss? Decisions, blockers, follow-ups…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!label.trim() || pending}
            onClick={() => onCreate({ label: label.trim(), start_date: start || undefined, end_date: end || undefined, meeting_notes: notes.trim() || undefined })}
          >
            Create sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersSheet({
  open, onOpenChange, teamId, members, users, onAdd, canManage,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamId: string | undefined;
  members: ReturnType<typeof useTeamMembers>["data"] extends infer X ? X extends undefined ? never : X : never;
  users: ReturnType<typeof useAllUsers>["data"] extends infer X ? X extends undefined ? never : X : never;
  onAdd: (userId: string) => void;
  onRemove: () => void;
  canManage: boolean;
}) {
  const [selectedUser, setSelectedUser] = useState<string>("");
  const memberIds = new Set((members || []).map((m) => m.user_id));
  const candidates = (users || []).filter((u) => !memberIds.has(u.id));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Team members</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            {(members || []).map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px]">
                    {initials(m.profile?.full_name || m.profile?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{m.profile?.full_name || m.profile?.email || "User"}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
          {canManage && teamId && (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Add member</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger><SelectValue placeholder="Pick a user" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!selectedUser} onClick={() => { onAdd(selectedUser); setSelectedUser(""); }}>
                Add
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotesSheet({
  open, onOpenChange, sprint, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sprint: { id: string; label: string; meeting_notes: string | null };
  onSave: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(sprint.meeting_notes ?? "");

  useEffect(() => {
    setNotes(sprint.meeting_notes ?? "");
  }, [sprint.id, sprint.meeting_notes]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Meeting notes — {sprint.label}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={20} placeholder="Decisions, follow-ups, attendees…" />
          <Button onClick={() => { onSave(notes); onOpenChange(false); }}>Save notes</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EditTaskDialog({
  task, open, onOpenChange, members, certifications, onSave, onDelete,
}: {
  task: TeamTask;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  members: ReturnType<typeof useTeamMembers>["data"] extends infer X ? X extends undefined ? never : X : never;
  certifications: ReturnType<typeof useCertificationOptions>["data"] extends infer X ? X extends undefined ? never : X : never;
  onSave: (updates: Partial<TeamTask>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title || task.task_name);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignee, setAssignee] = useState(task.assigned_to ?? "unassigned");
  const [project, setProject] = useState(task.certification_id ?? "general");
  const [priority, setPriority] = useState<string>(task.priority ?? "none");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [status, setStatus] = useState<TeamTaskStatus>(task.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(members || []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name || m.profile?.email || "User"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General (no project)</SelectItem>
                  {(certifications || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TeamTaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_COLUMNS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="flex sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() =>
                onSave({
                  title,
                  task_name: title,
                  description,
                  assigned_to: assignee === "unassigned" ? null : assignee,
                  certification_id: project === "general" ? null : project,
                  task_kind: project === "general" ? "general" : "project",
                  priority: priority === "none" ? null : (priority as TeamTaskPriority),
                  due_date: dueDate || null,
                  end_date: dueDate || null,
                  status,
                })
              }
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
