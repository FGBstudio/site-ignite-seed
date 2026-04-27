import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_DOMAINS = ["fgb-studio.com", "fgbstudio.com"];

const FUTURA: React.CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

// Filter to tint the green pittogramma to the burgundy/teal-d nuance for the brand title (kept teal here)
const PITTO_FILTER = ""; // green.png is already teal — no filter needed

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorVisible(false);

    const domain = email.split("@")[1]?.toLowerCase();
    if (!ALLOWED_DOMAINS.includes(domain)) {
      toast({
        title: "Access denied",
        description:
          "Only FGB users with company @fgb-studio.com domain are allowed to access.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      setErrorVisible(true);
      toast({ title: "Login error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "hsl(var(--background))" }}
    >
      <div
        className="w-full max-w-[360px] bg-card"
        style={{
          border: "0.5px solid hsl(var(--border))",
          borderRadius: 18,
          padding: "2.5rem 2rem 2rem",
          boxShadow: "0 8px 32px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.06)",
        }}
      >
        {/* ── Top: pittogramma + brand ── */}
        <div className="flex flex-col items-center gap-3 text-center mb-8">
          <img
            src="/white.png"
            alt="FGB"
            className="object-contain transition-transform duration-500"
            style={{
              width: 56,
              height: 56,
              filter: PITTO_FILTER,
              transitionTimingFunction: "cubic-bezier(.34,1.56,.64,1)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLImageElement).style.transform = "rotate(20deg) scale(1.1)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLImageElement).style.transform = "";
            }}
          />
          <div>
            <div
              className="text-foreground"
              style={{ ...FUTURA, fontSize: 20, letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              FGB Management Tool
            </div>
            <div
              className="text-muted-foreground mt-1"
              style={{ fontSize: 12, letterSpacing: "0.03em" }}
            >
              Sign in with your credentials
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* EMAIL */}
          <div className="flex flex-col gap-1 mb-3">
            <label
              className="text-muted-foreground"
              style={{ ...FUTURA, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}
            >
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name.surname@fgb-studio.com"
              className="text-foreground outline-none transition-colors"
              style={{
                padding: "10px 12px",
                border: "0.5px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 14,
                background: "hsl(var(--background))",
                fontFamily: "'DM Sans',sans-serif",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--primary))";
                e.currentTarget.style.background = "hsl(var(--card))";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--border))";
                e.currentTarget.style.background = "hsl(var(--background))";
              }}
            />
          </div>

          {/* PASSWORD */}
          <div className="flex flex-col gap-1 mb-3">
            <label
              className="text-muted-foreground"
              style={{ ...FUTURA, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}
            >
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="text-foreground outline-none transition-colors"
              style={{
                padding: "10px 12px",
                border: "0.5px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 14,
                background: "hsl(var(--background))",
                fontFamily: "'DM Sans',sans-serif",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--primary))";
                e.currentTarget.style.background = "hsl(var(--card))";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--border))";
                e.currentTarget.style.background = "hsl(var(--background))";
              }}
            />
          </div>

          {errorVisible && (
            <div
              className="text-destructive text-center mb-2"
              style={{ fontSize: 12 }}
            >
              Invalid credentials. Please try again.
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full transition-colors"
            style={{
              padding: 11,
              borderRadius: 8,
              border: "none",
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              ...FUTURA,
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              marginTop: 4,
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.background = "#006367";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "hsl(var(--primary))";
            }}
          >
            {isLoading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Domain restriction hint */}
        <p
          className="text-center mt-5 text-muted-foreground"
          style={{ fontSize: 10, letterSpacing: "0.04em" }}
        >
          Access restricted to{" "}
          <span className="text-foreground font-medium">@fgb-studio.com</span>
        </p>
      </div>
    </div>
  );
}
