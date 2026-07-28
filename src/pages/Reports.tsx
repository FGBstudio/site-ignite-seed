import { MainLayout } from "@/components/layout/MainLayout";
import { HardwareProcurementReport } from "@/components/reports/HardwareProcurementReport";

export default function Reports() {
  return (
    <MainLayout title="Reports & Analytics" subtitle="Hardware procurement demand forecasting & delivery analytics">
      <HardwareProcurementReport />
    </MainLayout>
  );
}

