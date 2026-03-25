
-- Add full_name column to profiles if missing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  certification text NOT NULL DEFAULT 'LEED',
  quantity_in_stock integer NOT NULL DEFAULT 0,
  supplier_lead_time_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products viewable by authenticated" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  client text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT 'Europe',
  pm_id uuid REFERENCES auth.users(id),
  handover_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Design',
  site_id uuid REFERENCES public.sites(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Projects viewable by authenticated" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM can manage own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = pm_id) WITH CHECK (auth.uid() = pm_id);

-- Create project_allocations table
CREATE TABLE IF NOT EXISTS public.project_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'Draft',
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allocations viewable by authenticated" ON public.project_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage allocations" ON public.project_allocations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

-- Create supplier_orders table
CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_name text NOT NULL DEFAULT '',
  quantity_requested integer NOT NULL DEFAULT 0,
  expected_delivery_date date,
  status text NOT NULL DEFAULT 'Draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supplier orders viewable by authenticated" ON public.supplier_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage supplier orders" ON public.supplier_orders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit logs viewable by admin" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Audit logs insertable by authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Create payment_milestones table
CREATE TABLE IF NOT EXISTS public.payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payment milestones viewable by authenticated" ON public.payment_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage payment milestones" ON public.payment_milestones FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

-- Create project_tasks table
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_name text NOT NULL DEFAULT '',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'todo',
  dependency_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  blocking_payment_id uuid REFERENCES public.payment_milestones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tasks viewable by authenticated" ON public.project_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage tasks" ON public.project_tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Assigned users can update tasks" ON public.project_tasks FOR UPDATE TO authenticated USING (auth.uid() = assigned_to) WITH CHECK (auth.uid() = assigned_to);

-- Create or replace get_user_role function
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Create view_resource_saturation view
CREATE OR REPLACE VIEW public.view_resource_saturation AS
SELECT
  assigned_to AS user_id,
  COUNT(*) FILTER (WHERE status IN ('todo', 'in_progress', 'review')) AS total_active_tasks,
  MIN(end_date) FILTER (WHERE status IN ('todo', 'in_progress', 'review')) AS next_deadline
FROM public.project_tasks
WHERE assigned_to IS NOT NULL
GROUP BY assigned_to;
