import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import PermissionsPageClient from "./permissions-page-client";

export const metadata = {
  title: "Dashboard permissions",
};

export default async function PermissionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status !== "approved") redirect("/dashboard");
  if (user.role !== "owner") redirect("/dashboard/users");

  return <PermissionsPageClient />;
}
