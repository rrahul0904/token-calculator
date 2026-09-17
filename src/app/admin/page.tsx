import { AdminOverview } from "@/components/admin-console";
import { getAdminOverviewData } from "@/lib/admin/data";
export default async function AdminPage() { return <AdminOverview data={await getAdminOverviewData()} />; }
