
-- 1. Expand roles (safe, non-destructive)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'document_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'specialist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'energy_modeler';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cxa';

-- 2. Financial tables
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'cancelled')),
  total_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_name text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid')),
  due_date date,
  created_at timestamptz DEFAULT now()
);

-- 3. Cronoprogramma engine (Tasks)
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  assigned_to uuid,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  dependency_id uuid REFERENCES public.project_tasks(id),
  blocking_payment_id uuid REFERENCES public.payment_milestones(id),
  created_at timestamptz DEFAULT now()
);

-- 4. RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access contracts" ON public.contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated access payments" ON public.payment_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated access tasks" ON public.project_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Resource saturation view
CREATE OR REPLACE VIEW public.view_resource_saturation AS
SELECT 
  assigned_to as user_id,
  COUNT(id) as total_active_tasks,
  MIN(start_date) as next_deadline
FROM public.project_tasks
WHERE status IN ('todo', 'in_progress') AND assigned_to IS NOT NULL
GROUP BY assigned_to;
