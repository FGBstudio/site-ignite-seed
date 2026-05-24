import { MainLayout } from "@/components/layout/MainLayout";
import { ProjectsReports } from "@/components/projects/ProjectsReports";

export default function Reports() {
  return (
    <MainLayout title="Reports" subtitle="Project delivery analytics — late, on hold, critical deadlines">
      <ProjectsReports />
    </MainLayout>
  );
}
