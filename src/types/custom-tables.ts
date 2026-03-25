// Local type definitions for tables not yet in auto-generated types.ts
// These match the DB schema created via migration.

export interface Product {
  id: string;
  sku: string;
  name: string;
  certification: string;
  quantity_in_stock: number;
  supplier_lead_time_days: number;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  region: string;
  pm_id: string | null;
  handover_date: string;
  status: string;
  site_id: string | null;
  project_type?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAllocation {
  id: string;
  project_id: string;
  product_id: string;
  quantity: number;
  status: string;
  target_date: string | null;
  created_at: string;
}

export interface SupplierOrder {
  id: string;
  product_id: string;
  supplier_name: string;
  quantity_requested: number;
  expected_delivery_date: string;
  status: string;
  created_at: string;
}

export type AppRole = "admin" | "editor" | "superuser" | "viewer" | "ADMIN" | "PM" | "document_manager" | "specialist" | "energy_modeler" | "cxa";

// --- Certification WBS & Gantt ---

export type CertTaskStatus = "Not_Started" | "In_Progress" | "Blocked" | "Completed";
export type CertPaymentStatus = "Pending" | "Invoiced" | "Paid" | "Overdue";

export interface CertWbsPhase {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface CertTask {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  status: CertTaskStatus;
  start_date: string | null;
  end_date: string | null;
  assignee_id: string | null;
  dependencies: string[];
  created_at: string;
  updated_at: string;
}

export interface CertTaskChecklist {
  id: string;
  task_id: string;
  requirement_text: string;
  is_completed: boolean;
}

export interface CertPaymentMilestone {
  id: string;
  project_id: string;
  name: string;
  amount: number;
  due_date: string | null;
  status: CertPaymentStatus;
  trigger_task_id: string | null;
  created_at: string;
}
