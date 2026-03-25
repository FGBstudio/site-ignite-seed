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
