import { useState } from "react";
import { Settings2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CTSettings, BridgeType, Strategy, LoadProfile } from "./types";

interface Props {
  settings: CTSettings;
  onChange: (next: CTSettings) => void;
}

export function CTBuilderSettings({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const updateProfile = (idx: number, patch: Partial<LoadProfile>) => {
    const next = settings.loadProfiles.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange({ ...settings, loadProfiles: next });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>CT Builder Settings</SheetTitle>
          <SheetDescription>
            Tune calculation parameters, load profiles and infrastructure.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Power Factor (cos φ)</Label>
              <span className="text-sm text-muted-foreground tabular-nums">
                {settings.pf.toFixed(2)}
              </span>
            </div>
            <Slider
              min={0.5}
              max={1.0}
              step={0.05}
              value={[settings.pf]}
              onValueChange={([v]) => onChange({ ...settings, pf: v })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Impact Threshold</Label>
              <span className="text-sm text-muted-foreground tabular-nums">
                {settings.threshold}%
              </span>
            </div>
            <Slider
              min={5}
              max={50}
              step={1}
              value={[settings.threshold]}
              onValueChange={([v]) => onChange({ ...settings, threshold: v })}
            />
          </div>

          <div className="space-y-3">
            <Label>Load Profiles</Label>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2 font-medium">Use</th>
                    <th className="text-right p-2 font-medium">Kc %</th>
                    <th className="text-right p-2 font-medium">Hours</th>
                    <th className="text-right p-2 font-medium">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.loadProfiles.map((p, i) => (
                    <tr key={p.use} className="border-t border-border">
                      <td className="p-1.5 text-foreground">{p.use}</td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          className="h-7 text-right"
                          value={p.kcPct}
                          onChange={(e) =>
                            updateProfile(i, { kcPct: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          className="h-7 text-right"
                          value={p.hours}
                          onChange={(e) =>
                            updateProfile(i, { hours: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          className="h-7 text-right"
                          value={p.days}
                          onChange={(e) =>
                            updateProfile(i, { days: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bridge Connectivity</Label>
            <Select
              value={settings.bridgeType}
              onValueChange={(v) => onChange({ ...settings, bridgeType: v as BridgeType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LAN">LAN</SelectItem>
                <SelectItem value="LTE">LTE</SelectItem>
                <SelectItem value="None">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label>Mango Gateway</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Include in BOM and totals</p>
            </div>
            <Switch
              checked={settings.useMango}
              onCheckedChange={(v) => onChange({ ...settings, useMango: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>Monitoring Strategy</Label>
            <RadioGroup
              value={settings.strategy}
              onValueChange={(v) => onChange({ ...settings, strategy: v as Strategy })}
              className="gap-2"
            >
              <div className="flex items-start space-x-2 rounded-md border border-border p-3">
                <RadioGroupItem value="individual" id="strat-ind" className="mt-0.5" />
                <Label htmlFor="strat-ind" className="font-normal cursor-pointer">
                  <span className="block font-medium">Individual Load &gt; Threshold</span>
                  <span className="text-xs text-muted-foreground">
                    Monitors only high-consumption lines.
                  </span>
                </Label>
              </div>
              <div className="flex items-start space-x-2 rounded-md border border-border p-3">
                <RadioGroupItem value="group" id="strat-grp" className="mt-0.5" />
                <Label htmlFor="strat-grp" className="font-normal cursor-pointer">
                  <span className="block font-medium">End-Use Group &gt; Threshold</span>
                  <span className="text-xs text-muted-foreground">
                    If a category exceeds threshold, monitors all of its loads.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
