import { Product, Project, ProjectAllocation, SupplierOrder, ProcurementAlert, Region } from '@/types/index';

interface ForecastingInput {
  products: Product[];
  projects: Project[];
  allocations: ProjectAllocation[];
  supplierOrders: SupplierOrder[];
}

export function generateProcurementAlerts({
  products,
  projects,
  allocations,
  supplierOrders,
}: ForecastingInput): ProcurementAlert[] {
  const alerts: ProcurementAlert[] = [];

  // Future demand: Draft or Allocated allocations
  const futureDemand = allocations.filter(
    (a) => a.status === 'Draft' || a.status === 'Allocated'
  );

  // Group demand by productId
  const demandByProduct = new Map<string, ProjectAllocation[]>();
  for (const alloc of futureDemand) {
    const list = demandByProduct.get(alloc.productId) || [];
    list.push(alloc);
    demandByProduct.set(alloc.productId, list);
  }

  for (const product of products) {
    const demand = demandByProduct.get(product.id) || [];
    if (demand.length === 0) continue;

    // Group demand by region+month using project handoverDate
    const regionMonthDemand = new Map<string, { total: number; earliestDate: string; projectIds: string[] }>();

    for (const alloc of demand) {
      const project = projects.find((p) => p.id === alloc.projectId);
      if (!project) continue;

      const month = project.handoverDate.substring(0, 7); // YYYY-MM
      const key = `${project.region}|${month}`;
      const existing = regionMonthDemand.get(key) || { total: 0, earliestDate: project.handoverDate, projectIds: [] };
      existing.total += alloc.quantity;
      if (project.handoverDate < existing.earliestDate) {
        existing.earliestDate = project.handoverDate;
      }
      if (!existing.projectIds.includes(project.id)) {
        existing.projectIds.push(project.id);
      }
      regionMonthDemand.set(key, existing);
    }

    // Incoming supply for this product
    const incomingSupply = supplierOrders
      .filter((so) => so.productId === product.id && (so.status === 'Sent' || so.status === 'In_Transit'))
      .reduce((sum, so) => sum + so.quantityRequested, 0);

    // Calculate net requirement cumulatively
    let availableStock = product.quantityInStock + incomingSupply;

    // Sort demand entries by earliest date
    const sortedEntries = [...regionMonthDemand.entries()].sort(
      (a, b) => a[1].earliestDate.localeCompare(b[1].earliestDate)
    );

    for (const [key, entry] of sortedEntries) {
      availableStock -= entry.total;

      if (availableStock < 0) {
        const [region, month] = key.split('|');
        const shortfall = Math.abs(availableStock);

        // Drop-dead order date = earliest project date - lead time
        const earliest = new Date(entry.earliestDate);
        earliest.setDate(earliest.getDate() - product.supplierLeadTimeDays);
        const dropDeadDate = earliest.toISOString().split('T')[0];

        alerts.push({
          id: `alert-${product.id}-${key}`,
          productId: product.id,
          productName: product.name,
          region: region as Region,
          month,
          shortfall,
          dropDeadDate,
          affectedProjects: entry.projectIds,
        });

        // Reset shortfall so next bucket only reports incremental
        availableStock = 0;
      }
    }
  }

  // Sort by drop-dead date (most urgent first)
  return alerts.sort((a, b) => a.dropDeadDate.localeCompare(b.dropDeadDate));
}

export function getAtRiskProjects(
  projects: Project[],
  allocations: ProjectAllocation[],
  products: Product[]
): (Project & { reason: string })[] {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);

  const atRisk: (Project & { reason: string })[] = [];

  for (const project of projects) {
    if (project.status === 'Completed' || project.status === 'Cancelled') continue;

    const handover = new Date(project.handoverDate);
    if (handover > thirtyDaysFromNow) continue;

    const projectAllocations = allocations.filter((a) => a.projectId === project.id);

    // Check for Draft allocations
    const hasDraft = projectAllocations.some((a) => a.status === 'Draft');

    // Check for missing stock
    const missingStock = projectAllocations.some((a) => {
      if (a.status !== 'Draft' && a.status !== 'Allocated') return false;
      const product = products.find((p) => p.id === a.productId);
      return product ? product.quantityInStock < a.quantity : true;
    });

    if (hasDraft) {
      atRisk.push({ ...project, reason: 'Allocazione ancora in stato Draft' });
    } else if (missingStock) {
      atRisk.push({ ...project, reason: 'Stock insufficiente per coprire la domanda' });
    }
  }

  return atRisk.sort((a, b) => a.handoverDate.localeCompare(b.handoverDate));
}

export function getInstallationBacklog(
  allocations: ProjectAllocation[],
  projects: Project[],
  products: Product[]
): { pm: string; items: { projectName: string; productName: string; quantity: number; targetDate: string }[] }[] {
  const shipped = allocations.filter((a) => a.status === 'Shipped');

  const byPm = new Map<string, { projectName: string; productName: string; quantity: number; targetDate: string }[]>();

  for (const alloc of shipped) {
    const project = projects.find((p) => p.id === alloc.projectId);
    const product = products.find((p) => p.id === alloc.productId);
    if (!project || !product) continue;

    const list = byPm.get(project.pm) || [];
    list.push({
      projectName: project.name,
      productName: product.name,
      quantity: alloc.quantity,
      targetDate: alloc.targetDate,
    });
    byPm.set(project.pm, list);
  }

  return [...byPm.entries()].map(([pm, items]) => ({ pm, items }));
}
