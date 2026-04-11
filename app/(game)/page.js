import SlotGame from '@/components/game/SlotGame';
import GAME_CONFIG from '@/lib/config';

export default function Home() {
  return <SlotGame config={GAME_CONFIG} />;
}