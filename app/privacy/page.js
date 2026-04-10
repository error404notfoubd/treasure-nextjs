import LegalPage from '@/components/LegalPage';
import GAME_CONFIG from '@/lib/controls';
import PRIVACY_POLICY from '@/lib/privacyPolicy';

export const metadata = {
  title:       `Privacy Policy — ${GAME_CONFIG.SITE.NAME}`,
  description: 'How we collect, use, and protect your personal data.',
  robots:      'noindex, follow',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This Privacy Policy explains how we collect and use information when you visit our website."
      sections={PRIVACY_POLICY}
      lastUpdated="March 2026"
    />
  );
}