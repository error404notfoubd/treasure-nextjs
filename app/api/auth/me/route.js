import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";

export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    console.error("[auth/me]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
