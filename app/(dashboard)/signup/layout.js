import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function SignupLayout({ children }) {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }
  return children;
}
