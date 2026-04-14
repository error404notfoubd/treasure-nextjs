import GAME_CONFIG from '@/lib/config';
import { getAppSettings, slotGameEconomyForConfig } from '@/lib/settings/app-settings';
import SurveyFlowClient from '@/components/survey/SurveyFlowClient';

export const metadata = {
  title: 'Survey — Treasure Hunt',
  description: 'Quick gaming survey and SMS verification for bonus treasure hunt coins.',
  robots: 'noindex, nofollow',
};

export default async function SurveyPage() {
  const economy = slotGameEconomyForConfig(await getAppSettings());
  const config = { ...GAME_CONFIG, ...economy };
  const surveyCountryCode = config.SURVEY_DEFAULT_COUNTRY_CODE ?? '+1';

  return (
    <SurveyFlowClient
      variant="page"
      surveyCountryCode={surveyCountryCode}
      bonusCredits={config.BONUS_CREDITS}
      startCredits={config.START_CREDITS}
    />
  );
}
