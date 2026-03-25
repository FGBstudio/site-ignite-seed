
-- 1. ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('ADMIN', 'PM');
CREATE TYPE public.region AS ENUM ('Europe', 'America', 'APAC', 'ME');
CREATE TYPE public.certification_type AS ENUM ('LEED', 'WELL', 'CO2', 'CO2-CO');
CREATE TYPE public.project_status AS ENUM ('Design', 'Construction', 'Completed', 'Cancelled');
CREATE TYPE public.allocation_status AS ENUM ('Draft', 'Allocated', 'Requested', 'Shipped', 'Installed_Online');
CREATE TYPE public.supplier_order_status AS ENUM ('Draft', 'Sent', 'In_Transit', 'Received');

-- 2. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. USER ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. SECURITY DEFINER FUNCTIONS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- 5. PRODUCTS TABLE
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  certification certification_type NOT NULL,
  quantity_in_stock INTEGER NOT NULL DEFAULT 0,
  supplier_lead_time_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 6. PROJECTS TABLE
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  client TEXT NOT NULL,
  region region NOT NULL,
  pm_id UUID REFERENCES public.profiles(id),
  handover_date DATE NOT NULL,
  status project_status NOT NULL DEFAULT 'Design',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 7. PROJECT ALLOCATIONS TABLE
CREATE TABLE public.project_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  status allocation_status NOT NULL DEFAULT 'Draft',
  target_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_allocations ENABLE ROW LEVEL SECURITY;

-- 8. SUPPLIER ORDERS TABLE
CREATE TABLE public.supplier_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity_requested INTEGER NOT NULL,
  expected_delivery_date DATE NOT NULL,
  status supplier_order_status NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;

-- 9. AUDIT LOGS TABLE
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  changed_field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 10. TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_allocations_updated_at BEFORE UPDATE ON public.project_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_supplier_orders_updated_at BEFORE UPDATE ON public.supplier_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 12. RLS POLICIES
CREATE POLICY "Authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Authenticated read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Admins manage projects" ON public.projects FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM reads own projects" ON public.projects FOR SELECT TO authenticated USING (pm_id = auth.uid());
CREATE POLICY "PM inserts own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (pm_id = auth.uid() AND public.has_role(auth.uid(), 'PM'));
CREATE POLICY "PM updates own projects" ON public.projects FOR UPDATE TO authenticated USING (pm_id = auth.uid() AND public.has_role(auth.uid(), 'PM'));
CREATE POLICY "Admins manage allocations" ON public.project_allocations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM reads own allocations" ON public.project_allocations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND pm_id = auth.uid()));
CREATE POLICY "PM updates own allocation status" ON public.project_allocations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND pm_id = auth.uid()));
CREATE POLICY "PM inserts own allocations" ON public.project_allocations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'PM') AND EXISTS (SELECT 1 FROM projects WHERE projects.id = project_allocations.project_id AND projects.pm_id = auth.uid()));
CREATE POLICY "PM deletes draft allocations" ON public.project_allocations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'PM') AND status = 'Draft' AND EXISTS (SELECT 1 FROM projects WHERE projects.id = project_allocations.project_id AND projects.pm_id = auth.uid()));
CREATE POLICY "Admins delete allocations" ON public.project_allocations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Admins manage supplier orders" ON public.supplier_orders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Admins read all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM reads own audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- SITES, CERTIFICATIONS
CREATE TYPE public.project_type AS ENUM ('LEED', 'WELL', 'Monitoring', 'Consulting');
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed');

CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ADD COLUMN site_id UUID REFERENCES public.sites(id);
ALTER TABLE public.projects ADD COLUMN project_type public.project_type;

CREATE TABLE public.certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  cert_type public.project_type NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  target_score NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.certification_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id UUID NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  requirement TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 0,
  status public.milestone_status NOT NULL DEFAULT 'pending',
  evidence_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certification_milestones ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false);

CREATE POLICY "Authenticated read sites" ON public.sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage sites" ON public.sites FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Admins manage certifications" ON public.certifications FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM reads own certifications" ON public.certifications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = certifications.project_id AND projects.pm_id = auth.uid()));
CREATE POLICY "PM updates own certifications" ON public.certifications FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = certifications.project_id AND projects.pm_id = auth.uid()));
CREATE POLICY "Admins manage milestones" ON public.certification_milestones FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM reads own milestones" ON public.certification_milestones FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.certifications c JOIN public.projects p ON p.id = c.project_id WHERE c.id = certification_milestones.certification_id AND p.pm_id = auth.uid()));
CREATE POLICY "PM updates own milestones" ON public.certification_milestones FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.certifications c JOIN public.projects p ON p.id = c.project_id WHERE c.id = certification_milestones.certification_id AND p.pm_id = auth.uid()));
CREATE POLICY "Authenticated upload evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "Authenticated read evidence" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence');
CREATE POLICY "Authenticated delete own evidence" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_certifications_updated_at BEFORE UPDATE ON public.certifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_milestones_updated_at BEFORE UPDATE ON public.certification_milestones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.certification_milestones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.certifications;

-- Holdings & Brands
CREATE TABLE public.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read holdings" ON public.holdings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage holdings" ON public.holdings FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE TRIGGER update_holdings_updated_at BEFORE UPDATE ON public.holdings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage brands" ON public.brands FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.sites ADD COLUMN brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

-- Expand roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'document_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'specialist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'energy_modeler';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cxa';

-- Add Energy certification type
ALTER TYPE public.certification_type ADD VALUE IF NOT EXISTS 'Energy';

-- Financial tables
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'cancelled')),
  total_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_name text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'paid')),
  due_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.project_tasks (
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

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage contracts" ON public.contracts FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role)) WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE POLICY "Authenticated read payments" ON public.payment_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage payments" ON public.payment_milestones FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role)) WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE POLICY "PM manages own project payments" ON public.payment_milestones FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = payment_milestones.project_id AND projects.pm_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = payment_milestones.project_id AND projects.pm_id = auth.uid()));
CREATE POLICY "Authenticated read tasks" ON public.project_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tasks" ON public.project_tasks FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role)) WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE POLICY "PM manages own project tasks" ON public.project_tasks FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_tasks.project_id AND projects.pm_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_tasks.project_id AND projects.pm_id = auth.uid()));

-- Resource saturation view
CREATE VIEW public.view_resource_saturation WITH (security_invoker = true) AS
SELECT 
  assigned_to as user_id,
  COUNT(id) as total_active_tasks,
  MIN(start_date) as next_deadline
FROM public.project_tasks
WHERE status IN ('todo', 'in_progress') AND assigned_to IS NOT NULL
GROUP BY assigned_to;
