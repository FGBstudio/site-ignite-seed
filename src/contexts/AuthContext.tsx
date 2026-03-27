import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
    const effectiveRole = pickBestRole([
      ...((rolesRes.data as Array<{ role: string }> | null)?.map((entry) => entry.role) ?? []),
      (roleRes.data as string | null | undefined) ?? null,
    ]);

    setRole(effectiveRole);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setLoading(true);
          setProfile(null);
          setRole(null);
          setTimeout(() => {
            void fetchUserData(session.user.id).finally(() => setLoading(false));
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setLoading(true);
        setProfile(null);
        setRole(null);
        await fetchUserData(session.user.id);
      } else {
        setProfile(null);
        setRole(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
    setProfile(null);
    setRole(null);
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
