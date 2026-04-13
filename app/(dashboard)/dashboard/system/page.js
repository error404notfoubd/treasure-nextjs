import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import SystemConfigurationClient from "./system-configuration-client";

export default async function SystemConfigurationPage() {
  const user = await getSessionUser();
  if (!user || user.status !== "approved" || user.role !== "owner") {
    redirect("/dashboard/settings");
  }
  return <SystemConfigurationClient />;
}
