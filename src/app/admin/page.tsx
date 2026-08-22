import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getOwnerAccess } from "@/lib/admin/authorization";
import { getAdminDashboardData } from "@/lib/admin/data";

export const metadata: Metadata = {
  title: "Owner approvals",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const access = await getOwnerAccess();
  if (!access.user) redirect("/?admin=1");
  if (!access.configured || !access.authorized) notFound();

  const data = await getAdminDashboardData();
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><p className="eyebrow">Owner only</p><h1>Approvals & operations</h1><p>Review community content, manage roles, and test sponsored placement.</p></div>
        <Link className="button button-secondary" href="/">Back to IWANNAPEE</Link>
      </header>
      <AdminDashboard currentUserId={access.user.id} initialData={data} />
    </main>
  );
}

