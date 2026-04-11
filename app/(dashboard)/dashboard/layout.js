import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
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

  return (
    <ToastProvider>
      <DashboardClient user={user}>{children}</DashboardClient>
    </ToastProvider>
  );
}
