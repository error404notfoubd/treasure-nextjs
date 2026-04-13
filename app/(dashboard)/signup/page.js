import { getSignupFormSettings } from "@/lib/settings/app-settings";
import SignupForm from "./signup-form";

export default async function SignupPage() {
  const { passwordMinLength, checkDebounceMs } = await getSignupFormSettings();
  return <SignupForm passwordMinLength={passwordMinLength} checkDebounceMs={checkDebounceMs} />;
}
