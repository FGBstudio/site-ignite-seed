import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/types/custom-tables";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

/**
 * Dove mandare qualcuno che è entrato.
 *
 * Torna `null` quando per quel ruolo non c'è nessuna pagina. Prima tornava
 * `/login`, e per un ruolo senza pagine quello era un anello: `/login` con una
 * sessione valida rimanda a `getDefaultRoute`, che rimandava a `/login`. Chi
 * entrava con il solo ruolo `viewer` — i nove accessi dei clienti — faceva
 * l'accesso con successo e poi restava su una pagina che si ricaricava da sola,
 * senza niente che dicesse perché.
 */
function getDefaultRoute(role: AppRole | null): string | null {
  switch (role) {
    // ADMIN and PM land on the Home Hub (5 pictograms)
    case "ADMIN":
    case "PM":
      return "/";
    case "document_manager":
    case "specialist":
    case "energy_modeler":
    case "cxa":
      return "/my-tasks";
    default:
      return null;
  }
}

export { getDefaultRoute };

/**
 * Il vicolo cieco, detto a parole.
 *
 * Non è una pagina di errore: è la risposta vera a «sono entrato e non vedo
 * niente». Oggi nessuna rotta ammette `viewer`, quindi un account con quel solo
 * ruolo è dentro e non ha dove andare. Dirlo, con il ruolo in chiaro e il modo di
 * uscire, vale più di un rimbalzo silenzioso.
 */
function SenzaDestinazione({ role }: { role: AppRole | null }) {
  const { signOut, profile } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="titolo text-lg">Accesso riuscito, ma nessuna sezione assegnata</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.email ? <>L'account <b>{profile.email}</b> è</> : "Questo account è"} entrato
          con il ruolo <b>{role ?? "nessun ruolo"}</b>, a cui non è associata nessuna pagina.
          Chiedi a un amministratore di assegnartene uno: da qui non c'è niente che tu possa
          aprire.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-[10px] border px-3 py-2 text-[12px] font-semibold"
        >
          Esci
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    const dove = getDefaultRoute(role);
    // Senza una destinazione non si rimbalza: si spiega. Rimandare a `/login`
    // chi ha già una sessione valida vuol dire rimandarlo qui un attimo dopo.
    if (!dove) return <SenzaDestinazione role={role} />;
    return <Navigate to={dove} replace />;
  }

  return <>{children}</>;
}
