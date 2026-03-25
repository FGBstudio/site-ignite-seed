export type Region = 'Europe' | 'America' | 'APAC' | 'ME';
export type CertificationType = 'LEED' | 'WELL' | 'CO2' | 'CO2-CO' | 'Energy';
export type ProjectStatus = 'Design' | 'Construction' | 'Completed' | 'Cancelled';
export type AllocationStatus = 'Draft' | 'Allocated' | 'Requested' | 'Shipped' | 'Installed_Online';

export interface Product {
  id: string;
  sku: string;
  name: string;
  certification: CertificationType;
  quantityInStock: number;
  supplierLeadTimeDays: number;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  region: Region;
  pm: string;
  handoverDate: string; // ISO Date YYYY-MM-DD
  status: ProjectStatus;
}

export interface ProjectAllocation {
  id: string;
  projectId: string;
  productId: string;
  quantity: number;
  status: AllocationStatus;
  targetDate: string;
}

export interface SupplierOrder {
  id: string;
  supplierName: string;
  productId: string;
  quantityRequested: number;
  expectedDeliveryDate: string;
  status: 'Draft' | 'Sent' | 'In_Transit' | 'Received';
}

export interface ProcurementAlert {
  id: string;
  productId: string;
  productName: string;
  region: Region;
  month: string; // YYYY-MM
  shortfall: number;
  dropDeadDate: string; // ISO Date
  affectedProjects: string[];
}
