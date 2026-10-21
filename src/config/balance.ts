/** Grid and build-screen tuning (concept.md §2.1, §2.3, §2.8). Starting values. */
export const GRID = {
  /** Side length of the starting grid. */
  startSize: 6,
  /** Each expansion adds one ring of cells: side length grows by 2. */
  expansionGrowth: 2,
  /** Largest grid side length. */
  maxSize: 10,
  /** World pixels per cell. */
  cellPx: 32,
  /** Game times (s) at which the grid grows by one ring, with a free build pause. */
  expandAt: [240, 480],
  /** How long the "GRID EXPANDED" banner stays after the pause (s). */
  bannerSec: 2.5,
} as const;

export const OFFERS = {
  /** Pieces offered per build pause. */
  count: 3,
} as const;

/** City driving (concept.md §2.5). */
export const MOVE = {
  baseSpeed: 150,
  /** Speed lost per tile above `penaltyFreeTiles`, as a fraction of base. */
  penaltyPerTile: 0.02,
  penaltyFreeTiles: 10,
  /** Size penalty never drops speed below this fraction of base. */
  minSpeedFactor: 0.55,
  /** Each online Engine adds this fraction of base, after the penalty. */
  engineBonus: 0.12,
  /** Start/stop ease time constant (s). */
  ease: 0.08,
} as const;

/** Camera (concept.md §3). */
export const CAMERA = {
  /** World px kept visible around the city on every side. */
  marginPx: 400,
  /** Never zoom in beyond 1:1. */
  maxZoom: 1,
  /** Follow smoothing rate (1/s). */
  followRate: 8,
  zoomRate: 3,
} as const;

/** Spawning (concept.md §4.1, §4.3). */
export const SPAWN = {
  /** Spawn ring = visible half-diagonal + this margin (px). */
  ringMargin: 60,
  /** Enemies further than ring + this are moved back onto the ring ahead of the city. */
  relocateBeyond: 400,
  /** Soft cap of live enemies; above it spawn groups arrive as elites (ELITE, enemies.ts). */
  maxEnemies: 600,
  /** Unused budget is capped so a full arena doesn't bank a huge burst. */
  maxBankedBudget: 20,
  clusterScatter: 40,
  lineSpacing: 18,
  /** Enemy HP grows by this fraction per minute. */
  hpGrowthPerMinute: 0.06,
} as const;

export const ENEMY_PHYSICS = {
  /** Knockback velocity decay rate (1/s). */
  knockbackDecay: 8,
  /** Fraction of overlap resolved per tick between enemies. */
  separation: 0.5,
  /** Enemies within this distance (px) of a tile count as touching it. */
  contactSlack: 1,
} as const;

export const COMBAT = {
  /** Retry delay when a weapon finds no target (s). */
  retargetDelay: 0.1,
  /** How often a cooling-down weapon re-aims at its nearest target (s), for turning barrels. */
  aimInterval: 0.1,
  /** Projectiles live for range / speed × this. */
  projectileLifeFactor: 1.15,
} as const;

/** XP and levels (concept.md §2.8). */
export const XP = {
  /** XP to next level = base + perLevel × level. */
  base: 5,
  perLevel: 4,
  /** Gem pickup radius around any tile (px). */
  pickupRadius: 24,
  /** Live gem cap; beyond it new XP is added to an existing gem. */
  maxGems: 400,
} as const;

export const LEVEL_UP = {
  /** Repair Core heals this fraction of the Core's max HP. */
  repairCoreFraction: 0.35,
  rerollsPerRun: 2,
  /** Scrapping a placed piece refunds this fraction of the current level's XP requirement. */
  scrapRefund: 0.25,
} as const;

/** Simulation tick (concept.md §9). */
export const SIM = {
  dt: 1 / 60,
  /** Longest frame gap simulated in one go (s); avoids a spiral after tab switches. */
  maxFrame: 0.25,
} as const;

/** Tile type upgrades (concept.md §2.8). */
export const UPGRADES = {
  /** Weapon damage per level above 1. */
  damagePerLevel: 0.25,
  /** Support effect per level above 1. */
  effectPerLevel: 0.2,
  /** Hull/Plating max HP per level above 1. */
  hpPerLevel: 0.2,
  maxLevel: 5,
} as const;

/** Weapon chains (concept.md §2.7; filled rows/columns removed in v2). */
export const LINES = {
  /** Identical weapons in a straight line needed for a chain. */
  chainMin: 3,
  /** Chain damage bonus: this much at chainMin, plus this much per extra tile… */
  chainBonusStep: 0.5,
  /** …up to this bonus (5+ tiles). */
  chainMaxBonus: 1.5,
} as const;
