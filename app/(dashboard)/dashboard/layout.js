import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getPermissionKeysForRole } from "@/lib/permission-grants";
import { ToastProvider } from "@/components/toast";
import DashboardClient from "./dashboard-client";
import PendingApproval from "./pending-approval";

export default async function DashboardLayout({ children }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.status !== "approved") {
    return (
      <ToastProvider>
        <PendingApproval user={user} />
      </ToastProvider>
    );
  }

  const permissions = await getPermissionKeysForRole(user.role);

  return (
    <ToastProvider>
      <DashboardClient user={{ ...user, permissions }}>{children}</DashboardClient>
    </ToastProvider>
  );
}
