import SlotGame from '@/components/game/SlotGame';
import GAME_CONFIG from '@/lib/config';
import { getAppSettings, slotGameEconomyForConfig } from '@/lib/settings/app-settings';

export default async function Home() {
  const economy = slotGameEconomyForConfig(await getAppSettings());
  const config = { ...GAME_CONFIG, ...economy };
  return <SlotGame config={config} />;
}
