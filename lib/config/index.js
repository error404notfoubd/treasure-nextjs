import gameConfig from "./game.js";
import dashboardConfig from "./dashboard.js";
import siteConfig from "./site.js";

/**
 * Flattened config for backward compatibility (`GAME_CONFIG.AUTH_API`, etc.).
 * Prefer importing {@link gameConfig} or {@link dashboardConfig} when scope is clear.
 */
const GAME_CONFIG = {
  ...gameConfig,
  ...dashboardConfig,
};

export default GAME_CONFIG;
export { gameConfig, dashboardConfig, siteConfig };
