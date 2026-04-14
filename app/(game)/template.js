/**
 * Wraps each route segment so a light enter animation runs on client navigations
 * between the game and survey (shared (game) layout stays mounted).
 */
export default function GameTemplate({ children }) {
  return <div className="game-route-enter">{children}</div>;
}
