export const PALETTE = {
  bg: 0xf4f1ea,
  ground: 0xe9e4d9,
  props: [0xdcd6c8, 0xd0cabe, 0xbfb8a8, 0xefece3],
  accent: 0xff5050,
  fast: 0xff8a63,
  hazard: 0x2e3d4f,
  gun: 0xffffff,
  gunDark: 0x2a2723,
} as const;

export const TUNING = {
  roundTime: 60,
  /** seconds between shots */
  fireCooldown: 0.25,
  tracerSpeed: 170,
  tracerMaxLength: 80,
  muzzleFlashTime: 0.07,

  spawnIntervalStart: 1.15,
  spawnIntervalEnd: 0.5,
  maxAliveStart: 6,
  maxAliveEnd: 11,
  targetLifeMin: 7,
  targetLifeMax: 10,
  fastChanceMax: 0.25,
  hazardChance: 0.13,

  points: { standard: 100, fast: 250, hazard: -150 } as Record<string, number>,
  distBonusPerUnit: 2,
  distBonusFrom: 10,
  comboStep: 4,
  comboMax: 5,

  hitstopSec: 0.045,
  hitstopScale: 0.25,
  shakeFire: 0.012,
  shakeHazard: 0.05,

  aimFilter: { minCutoff: 1.8, beta: 0.3 },
} as const;

export const GESTURE = {
  /** d(tip, midKnuckle) / d(pip, midKnuckle) above this = index extended */
  indexExtRatio: 1.12,
  /** hammer value (thumb tip above its IP joint, palm units) to enter cocked */
  cockedUpness: 0.16,
  /** below this while cocked = disarm back to idle */
  cockedExitUpness: 0.1,
  /** deep-down floor: below this = fired regardless of speed */
  firedUpness: 0.04,
  /** how far below the cocked peak counts as a hammer drop (palm units) */
  dropAbs: 0.07,
  /** snap velocity needed alongside the drop (palm units per second) */
  dropVel: -0.9,
  /** must stay cocked this long before it can fire (ms) */
  cockedHoldMs: 110,
  /** minimum ms between shots */
  refireMs: 250,
  /** how far past the fingertip the aim ray extends (palm-space) */
  aimExtension: 0.38,
} as const;

export const UI = {
  highScoreKey: 'fingershooter_best',
} as const;
