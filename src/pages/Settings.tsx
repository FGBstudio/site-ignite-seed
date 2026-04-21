import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Settings() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "ADMIN";

  const [notifyEscalations, setNotifyEscalations] = useState<boolean>(true);
  const [loadingPref, setLoadingPref] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  useEffect(() => {
    if (!user?.id || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoadingPref(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("notify_escalations_email")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && !error && data) {
        setNotifyEscalations((data as any).notify_escalations_email ?? true);
      }
      if (!cancelled) setLoadingPref(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, isAdmin]);

  const handleToggleNotify = async (value: boolean) => {
    if (!user?.id) return;
    setNotifyEscalations(value);
    setSavingPref(true);
    const { error } = await supabase
      .from("profiles")
      .update({ notify_escalations_email: value } as any)
      .eq("id", user.id);
    setSavingPref(false);
    if (error) {
      toast({ variant: "destructive", title: "Could not save preference", description: error.message });
      setNotifyEscalations(!value);
    } else {
      toast({ title: "Preference saved" });
    }
  };

  return (
    <MainLayout title="Settings" subtitle="Configure the system">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
            <CardDescription>Your organization's details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="company">Company Name</Label>
              <Input id="company" placeholder="Your company" defaultValue="StockFlow SRL" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="info@company.com" defaultValue={profile?.email ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="warehouse">Warehouse Name</Label>
              <Input id="warehouse" placeholder="Main warehouse" defaultValue="Milan Warehouse" />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Manage notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin && (
              <>
                <div className="flex items-center justify-between">
                  <div className="pr-4">
                    <p className="font-medium flex items-center gap-2">
                      Email me on escalations
                      {(loadingPref || savingPref) && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Receive an email when a PM escalates a financial, timeline, or operational alert to admins.
                      In-app pop-ups are always on.
                    </p>
                  </div>
                  <Switch
                    checked={notifyEscalations}
                    onCheckedChange={handleToggleNotify}
                    disabled={loadingPref || savingPref}
                  />
                </div>
                <Separator />
              </>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Low Stock Alert</p>
                <p className="text-sm text-muted-foreground">Receive notifications when a product drops below threshold</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">New Orders</p>
                <p className="text-sm text-muted-foreground">Notification for every new order received</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly Reports</p>
                <p className="text-sm text-muted-foreground">Weekly summary via email</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock Thresholds</CardTitle>
            <CardDescription>Configure default alert thresholds</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="minStock">Default Minimum Threshold</Label>
              <Input id="minStock" type="number" defaultValue="10" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="criticalStock">Critical Threshold</Label>
              <Input id="criticalStock" type="number" defaultValue="5" />
            </div>
            <Button>Update Thresholds</Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
