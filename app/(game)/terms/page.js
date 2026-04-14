import LegalPage from '@/components/LegalPage';
import GAME_CONFIG from '@/lib/config';
import TERMS_AND_CONDITIONS from '@/lib/termsAndConditions';

export const metadata = {
  title:       `Terms & Conditions — ${GAME_CONFIG.SITE.NAME}`,
  description: `Terms and conditions for using ${GAME_CONFIG.SITE.NAME}.`,
  robots:      'noindex, follow',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro="Welcome to our website. By accessing or using this site, you agree to the following Terms and Conditions. If you do not agree, please do not use the site."
      sections={TERMS_AND_CONDITIONS}
      lastUpdated="March 2026"
    />
  );
}