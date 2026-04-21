import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/** Inline "+ New Holding" popover — Admin only. Calls onCreated(holdingId) so caller auto-selects it. */
export function NewHoldingButton({ onCreated, disabled }: { onCreated: (id: string) => void; disabled?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("holdings")
        .insert({ name: name.trim(), logo_url: logo.trim() || null })
        .select("id")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["holdings"] });
      toast({ title: "Holding created" });
      onCreated(data.id);
      setOpen(false);
      setName("");
      setLogo("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not create holding", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} title="New holding">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Holding name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LVMH" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Logo URL (optional)</Label>
          <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Inline "+ New Brand" popover — needs holdingId. Calls onCreated(brandId). */
export function NewBrandButton({
  holdingId, onCreated, disabled,
}: { holdingId: string | null | undefined; onCreated: (id: string) => void; disabled?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !holdingId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("brands")
        .insert({ name: name.trim(), holding_id: holdingId, logo_url: logo.trim() || null })
        .select("id")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["brands"] });
      qc.invalidateQueries({ queryKey: ["brands", holdingId] });
      toast({ title: "Brand created" });
      onCreated(data.id);
      setOpen(false);
      setName("");
      setLogo("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not create brand", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !holdingId} title="New brand">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Brand name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Louis Vuitton" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Logo URL (optional)</Label>
          <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
