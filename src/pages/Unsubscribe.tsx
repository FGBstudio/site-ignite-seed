import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid"; message: string }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "Missing unsubscribe token." });
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    fetch(
      `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
      { headers: { apikey: anonKey } },
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ kind: "invalid", message: data.error || "Invalid or expired link." });
          return;
        }
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setState({ kind: "already" });
        } else if (data.valid === true) {
          setState({ kind: "valid" });
        } else {
          setState({ kind: "invalid", message: "Invalid token." });
        }
      })
      .catch(() => setState({ kind: "invalid", message: "Network error." }));
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (error) {
      setState({ kind: "error", message: error.message });
      return;
    }
    if (data?.success || data?.reason === "already_unsubscribed") {
      setState({ kind: "success" });
    } else {
      setState({ kind: "error", message: "Could not process unsubscribe." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>FGB Studio notification settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validating link…
            </div>
          )}

          {state.kind === "valid" && (
            <>
              <p className="text-sm text-muted-foreground">
                Confirm to stop receiving escalation and notification emails from FGB Studio at this address.
              </p>
              <Button onClick={handleConfirm} className="w-full">
                Confirm unsubscribe
              </Button>
            </>
          )}

          {state.kind === "submitting" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processing…
            </div>
          )}

          {state.kind === "success" && (
            <div className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              <div>
                <p className="font-medium">You've been unsubscribed.</p>
                <p className="text-muted-foreground">You will no longer receive these emails.</p>
              </div>
            </div>
          )}

          {state.kind === "already" && (
            <div className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              <p>This address is already unsubscribed.</p>
            </div>
          )}

          {(state.kind === "invalid" || state.kind === "error") && (
            <div className="flex items-start gap-3 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <p>{state.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
