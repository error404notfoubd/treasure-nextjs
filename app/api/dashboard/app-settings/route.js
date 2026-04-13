import { NextResponse } from "next/server";
import { rejectIfNotDashboardHost } from "@/lib/dashboard/api-host";
import { requireOwner } from "@/lib/auth/session";
import {
  getAppSettings,
  parseAppSettingsPatch,
  persistAppSettings,
  appSettingsToJson,
} from "@/lib/settings/app-settings";

export const runtime = "nodejs";

/** Owner-only: read current app_settings row (camelCase). */
export async function GET(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requireOwner();
  if (guard.error) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const s = await getAppSettings();
  return NextResponse.json(appSettingsToJson(s));
}

/** Owner-only: replace tunables from JSON body (partial updates supported). */
export async function PATCH(request) {
  const hostErr = rejectIfNotDashboardHost(request);
  if (hostErr) return hostErr;

  const guard = await requireOwner();
  if (guard.error) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const current = await getAppSettings();
  const parsed = parseAppSettingsPatch(body, current);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const saved = await persistAppSettings(parsed.settings);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error || "Could not save settings." }, { status: 500 });
  }

  return NextResponse.json(appSettingsToJson(parsed.settings));
}
