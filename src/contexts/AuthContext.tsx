import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/types/custom-tables";

const ROLE_PRIORITY: AppRole[] = ["ADMIN", "PM", "document_manager", "specialist", "energy_modeler", "cxa", "admin", "superuser", "editor", "viewer"];

function normalizeRole(rawRole: string | null | undefined): AppRole | null {
  if (!rawRole) return null;
  if (rawRole === "admin") return "ADMIN";
  if (rawRole === "pm") return "PM";
  return rawRole as AppRole;
}

function pickBestRole(rawRoles: Array<string | null | undefined>): AppRole | null {
  const normalizedRoles = rawRoles
    .map(normalizeRole)
    .filter((role): role is AppRole => Boolean(role));

  return ROLE_PRIORITY.find((role) => normalizedRoles.includes(role)) ?? normalizedRoles[0] ?? null;
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isPM: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Tiene traccia dell'utente loggato per evitare ricaricamenti molesti
  const loadedUserId = useRef<string | null>(null);

  const fetchUserData = async (userId: string) => {
    const [profileRes, rolesRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("user_roles" as any).select("role").eq("user_id", userId),
      supabase.rpc("get_user_role" as any, { _user_id: userId }),
    ]);

    if (profileRes.data) {
      const p = profileRes.data as any;
      setProfile({
        id: p.id,
        email: p.email,
        full_name: p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
      });
    }
    const directRoles = Array.isArray(rolesRes.data)
      ? (rolesRes.data as any[]).map((entry) => entry?.role as string | null | undefined)
      : [];

    const effectiveRole = pickBestRole([
      ...directRoles,
      (roleRes.data as string | null | undefined) ?? null,
    ]);

    setRole(effectiveRole);
  };

  useEffect(() => {
    let mounted = true;

    // 1. Inizializzazione a freddo (avviene solo al primo caricamento della pagina)
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session?.user) {
        setSession(session);
        setUser(session.user);
        loadedUserId.current = session.user.id;
        await fetchUserData(session.user.id);
      }
      
      // Abbassiamo il flag di loading UNA SOLA VOLTA. Non diventerà mai più true.
      setLoading(false);
    };

    initializeAuth();

    // 2. Listener per eventi in background (Cambio tab, refresh token, ecc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // LOGOUT REALE: Solo se l'utente clicca esplicitamente "Esci"
      if (event === "SIGNED_OUT") {
        loadedUserId.current = null;
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        return;
      }

      // Se Supabase invia un "ghost event" con sessione vuota (glitch al cambio tab), lo IGNORIAMO completamente.
      if (!session?.user) return;

      // Aggiorniamo i token in background senza disturbare la UI
      setSession(session);
      setUser(session.user);

      // Se per caso cambia l'account (raro), ricarichiamo i dati di profilo 
      // in background SENZA impostare loading=true, così non smontiamo la pagina.
      if (loadedUserId.current !== session.user.id) {
        loadedUserId.current = session.user.id;
        fetchUserData(session.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session, user, profile, role, loading,
        signIn, signUp, signOut,
        isAdmin: role === "ADMIN",
        isPM: role === "PM",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
