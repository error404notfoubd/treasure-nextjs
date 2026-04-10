import SlotGame from '@/components/SlotGame';
import GAME_CONFIG from '@/lib/controls';

export default function Home() {
  return <SlotGame config={GAME_CONFIG} />;
}