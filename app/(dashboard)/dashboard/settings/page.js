import { getAppSettings } from "@/lib/settings/app-settings";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const s = await getAppSettings();
  return <SettingsClient passwordMinLength={s.passwordMinLength} />;
}
