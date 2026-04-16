import SlotGame from '@/components/game/SlotGame';
import GAME_CONFIG, { siteConfig } from '@/lib/config';
import { getAppSettings, slotGameEconomyForConfig } from '@/lib/settings/app-settings';

function normalizeFacebookPageUrl(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : '';
  } catch {
    return '';
  }
}

export default async function Home() {
  const economy = slotGameEconomyForConfig(await getAppSettings());
  const FACEBOOK_PAGE_URL = normalizeFacebookPageUrl(siteConfig.FACEBOOK_PAGE_URL);
  const config = { ...GAME_CONFIG, ...economy, FACEBOOK_PAGE_URL };
  return <SlotGame config={config} />;
}
