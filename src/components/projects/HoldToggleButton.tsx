import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Pause, Play, Loader2 } from "lucide-react";
import { useHoldCertification } from "@/hooks/useHoldCertification";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Props {
  certId: string;
  onHold: boolean;
  reason?: string | null;
  size?: "sm" | "default";
  variant?: "icon" | "button";
  className?: string;
}

/**
 * Admin-only toggle to place a certification On Hold or Release it.
 * - "icon" variant: compact icon button (for tables)
 * - "button" variant: labeled button (for headers)
 * Non-admins see nothing.
 */
export function HoldToggleButton({ certId, onHold, reason, size = "sm", variant = "icon", className }: Props) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { hold, release } = useHoldCertification();

  if (!isAdmin) return null;

  const busy = hold.isPending || release.isPending;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onHold) {
      release.mutate({ certId });
    } else {
      setText("");
      setOpen(true);
    }
  };

  const submitHold = () => {
    if (!text.trim()) return;
    hold.mutate({ certId, reason: text.trim() }, { onSuccess: () => setOpen(false) });
  };

  return (
    <>
      {variant === "icon" ? (
        <Button
          size={size}
          variant={onHold ? "destructive" : "ghost"}
          onClick={handleClick}
          disabled={busy}
          title={onHold ? `On hold — click to release${reason ? ` (${reason})` : ""}` : "Place on hold"}
          className={cn("gap-1", className)}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : onHold ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {onHold ? "Release" : "Hold"}
        </Button>
      ) : (
        <Button
          size={size}
          variant={onHold ? "destructive" : "outline"}
          onClick={handleClick}
          disabled={busy}
          className={cn("gap-2", className)}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : onHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {onHold ? "Release project" : "Put on hold"}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put project on hold</DialogTitle>
            <DialogDescription>
              While on hold, the assigned PM cannot edit tasks, milestones, payments, or the project itself. Only admins can release it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (required)</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Client payment overdue — awaiting settlement"
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submitHold} disabled={!text.trim() || hold.isPending}>
              {hold.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
              Confirm hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
