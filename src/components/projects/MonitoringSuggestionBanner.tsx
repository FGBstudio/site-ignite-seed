import { Wind, Zap, Droplet, PackageCheck, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CertFlags {
  has_iaq_monitoring?: boolean | null;
  has_energy_monitoring?: boolean | null;
  has_water_monitoring?: boolean | null;
  has_hardware_redirection?: boolean | null;
}

interface Props {
  cert: CertFlags | null | undefined;
}

const ITEMS: Array<{
  key: keyof CertFlags;
  label: string;
  hint: string;
  Icon: typeof Wind;
  className: string;
}> = [
  {
    key: "has_iaq_monitoring",
    label: "IAQ Monitoring (ClAir)",
    hint: "Air quality sensors will be allocated to the site.",
    Icon: Wind,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  {
    key: "has_energy_monitoring",
    label: "Energy Monitoring (Greeny)",
    hint: "CT Builder will define the exact BOM; a generic placeholder is created.",
    Icon: Zap,
    className: "bg-warning/10 text-warning border-warning/20",
  },
  {
    key: "has_water_monitoring",
    label: "Water Monitoring",
    hint: "Water sensors will be allocated to the site.",
    Icon: Droplet,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  {
    key: "has_hardware_redirection",
    label: "Hardware Redirection",
    hint: "Third-party hardware will be redirected — no FGB sensors shipped.",
    Icon: PackageCheck,
    className: "bg-muted text-muted-foreground border-border",
  },
];

export function MonitoringSuggestionBanner({ cert }: Props) {
  if (!cert) return null;
  const active = ITEMS.filter((it) => cert[it.key]);
  if (active.length === 0) return null;

  return (
    <Card className="p-3 bg-muted/30 border-dashed">
      <div className="flex items-start gap-2.5">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground mb-1.5">
            Monitoring services configured for this certification
          </p>
          <div className="flex flex-wrap gap-2">
            {active.map(({ key, label, hint, Icon, className }) => (
              <Badge
                key={key}
                variant="outline"
                className={`gap-1.5 font-normal text-[11px] ${className}`}
                title={hint}
              >
                <Icon className="h-3 w-3" />
                {label}
              </Badge>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            The Monitoring Team will be notified automatically when you confirm the
            certification. You can still request additional hardware below.
          </p>
        </div>
      </div>
    </Card>
  );
}
