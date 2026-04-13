import gameConfig from "./game.js";
import siteConfig from "./site.js";

/**
 * Flattened config for backward compatibility (`GAME_CONFIG.SITE`, survey lists, …).
 * Tunable economy / auth / survey caps are loaded from `app_settings` on the server.
 */
const GAME_CONFIG = {
  ...gameConfig,
};

export default GAME_CONFIG;
export { gameConfig, siteConfig };
