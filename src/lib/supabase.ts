// Re-export the shared Supabase client so it can be imported from either:
//   import { supabase } from "@/lib/supabase"
//   import { supabase } from "@/integrations/supabase/client"
export { supabase } from "@/integrations/supabase/client";
export type { Database } from "@/integrations/supabase/types";
