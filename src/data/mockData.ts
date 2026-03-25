import { Product, Project, ProjectAllocation, SupplierOrder } from '@/types/index';

// Helper: date relative to today
const futureDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
};

export const mockProducts: Product[] = [
  { id: 'prod-1', sku: 'IAQ-WELL-01', name: 'IAQ WELL', certification: 'WELL', quantityInStock: 0, supplierLeadTimeDays: 30 },
  { id: 'prod-2', sku: 'IAQ-LEED-01', name: 'IAQ LEED', certification: 'LEED', quantityInStock: 0, supplierLeadTimeDays: 30 },
  { id: 'prod-3', sku: 'IAQ-CO2-01', name: 'IAQ CO2', certification: 'CO2', quantityInStock: 0, supplierLeadTimeDays: 30 },
  { id: 'prod-4', sku: 'IAQ-COCO2-01', name: 'IAQ CO-CO2', certification: 'CO2-CO', quantityInStock: 0, supplierLeadTimeDays: 30 },
  { id: 'prod-5', sku: 'ENERGY-SYS-01', name: 'Energy System', certification: 'LEED', quantityInStock: 0, supplierLeadTimeDays: 45 },
];

export const mockProjects: Project[] = [
  { id: 'prj-1', name: 'Miu Miu Dubai Mall', client: 'Miu Miu', region: 'ME', pm: 'Marco Rossi', handoverDate: futureDate(20), status: 'Construction' },
  { id: 'prj-2', name: 'Prada San Diego', client: 'Prada', region: 'America', pm: 'Laura Bianchi', handoverDate: futureDate(25), status: 'Construction' },
  { id: 'prj-3', name: 'Prada Champs-Élysées', client: 'Prada', region: 'Europe', pm: 'Sophie Dupont', handoverDate: futureDate(60), status: 'Design' },
  { id: 'prj-4', name: 'Miu Miu Tokyo Ginza', client: 'Miu Miu', region: 'APAC', pm: 'Yuki Tanaka', handoverDate: futureDate(90), status: 'Design' },
  { id: 'prj-5', name: 'Prada Milano Montenapoleone', client: 'Prada', region: 'Europe', pm: 'Marco Rossi', handoverDate: futureDate(120), status: 'Design' },
  { id: 'prj-6', name: 'Miu Miu New York SoHo', client: 'Miu Miu', region: 'America', pm: 'Laura Bianchi', handoverDate: futureDate(150), status: 'Design' },
  { id: 'prj-7', name: 'Prada Singapore MBS', client: 'Prada', region: 'APAC', pm: 'Yuki Tanaka', handoverDate: futureDate(45), status: 'Construction' },
  { id: 'prj-8', name: 'Miu Miu London Bond St', client: 'Miu Miu', region: 'Europe', pm: 'Sophie Dupont', handoverDate: futureDate(35), status: 'Construction' },
];

export const mockAllocations: ProjectAllocation[] = [
  // Miu Miu Dubai — needs 10 monitors + 8 sensors, handover in 20 days
  { id: 'alloc-1', projectId: 'prj-1', productId: 'prod-1', quantity: 10, status: 'Draft', targetDate: futureDate(5) },
  { id: 'alloc-2', projectId: 'prj-1', productId: 'prod-2', quantity: 8, status: 'Allocated', targetDate: futureDate(5) },
  // Prada San Diego — needs 6 monitors + 5 sensors, handover in 25 days
  { id: 'alloc-3', projectId: 'prj-2', productId: 'prod-1', quantity: 6, status: 'Draft', targetDate: futureDate(10) },
  { id: 'alloc-4', projectId: 'prj-2', productId: 'prod-2', quantity: 5, status: 'Allocated', targetDate: futureDate(10) },
  // Prada Champs-Élysées — 8 monitors + 6 sensors
  { id: 'alloc-5', projectId: 'prj-3', productId: 'prod-1', quantity: 8, status: 'Draft', targetDate: futureDate(45) },
  { id: 'alloc-6', projectId: 'prj-3', productId: 'prod-2', quantity: 6, status: 'Draft', targetDate: futureDate(45) },
  // Miu Miu Tokyo Ginza — 12 monitors + 10 sensors
  { id: 'alloc-7', projectId: 'prj-4', productId: 'prod-1', quantity: 12, status: 'Draft', targetDate: futureDate(75) },
  { id: 'alloc-8', projectId: 'prj-4', productId: 'prod-2', quantity: 10, status: 'Draft', targetDate: futureDate(75) },
  // Prada Milano — 6 monitors + 4 sensors
  { id: 'alloc-9', projectId: 'prj-5', productId: 'prod-1', quantity: 6, status: 'Draft', targetDate: futureDate(105) },
  { id: 'alloc-10', projectId: 'prj-5', productId: 'prod-2', quantity: 4, status: 'Draft', targetDate: futureDate(105) },
  // Miu Miu NY SoHo — 10 monitors + 8 sensors
  { id: 'alloc-11', projectId: 'prj-6', productId: 'prod-1', quantity: 10, status: 'Draft', targetDate: futureDate(135) },
  { id: 'alloc-12', projectId: 'prj-6', productId: 'prod-2', quantity: 8, status: 'Draft', targetDate: futureDate(135) },
  // Prada Singapore — Shipped (for backlog)
  { id: 'alloc-13', projectId: 'prj-7', productId: 'prod-1', quantity: 4, status: 'Shipped', targetDate: futureDate(30) },
  { id: 'alloc-14', projectId: 'prj-7', productId: 'prod-2', quantity: 3, status: 'Shipped', targetDate: futureDate(30) },
  // Miu Miu London — Shipped (for backlog)
  { id: 'alloc-15', projectId: 'prj-8', productId: 'prod-1', quantity: 5, status: 'Shipped', targetDate: futureDate(20) },
  { id: 'alloc-16', projectId: 'prj-8', productId: 'prod-2', quantity: 4, status: 'Shipped', targetDate: futureDate(20) },
];

export const mockSupplierOrders: SupplierOrder[] = [
  {
    id: 'so-1',
    supplierName: 'LG Display B2B',
    productId: 'prod-1',
    quantityRequested: 10,
    expectedDeliveryDate: futureDate(30),
    status: 'In_Transit',
  },
  {
    id: 'so-2',
    supplierName: 'Sensirion AG',
    productId: 'prod-2',
    quantityRequested: 15,
    expectedDeliveryDate: futureDate(20),
    status: 'Sent',
  },
];
