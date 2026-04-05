import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
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
              <Input id="email" type="email" placeholder="info@company.com" defaultValue="info@stockflow.it" />
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
