// Every tunable lives here. ROM per-tick values are converted to per-second with TICK.
const TICK = 15.625;                 // ROM game-logic ticks per second
const STEP = (Math.PI * 2) / 512;    // one ROM rotation step (0.703°)
const A = (Math.PI * 2) / 256;       // one ROM "A" angle unit (1.406°)

export const VIEW = {
  width: 1920,
  height: 1080,
  focal: 720,         // 540 / tan(73.74°/2): original vertical FOV, widened horizontally to 16:9
  near: 64,
  far: 40000,
  redLinePx: 216,     // top 1/5 of the screen sits behind the red overlay
  joltPx: 90,         // horizon drop on hit/blocked (ROM horizon_adj = $3F ≈ 63 AVG units)
  modelIntensity: 24, // ROM shape intensity (16..30) that maps to full brightness
};

// ponytail: math box halves X/Z, so double Y. Side-on tank height/length is 0.35; scale 1 is squashed flat.
export const MODEL_Y_SCALE = 2;

export const BG = {
  phase: 512,     // ponytail: facing 0, ROM parks section 0 on the left half (view center is landscape x=512). Moon centroid x≈488 then sits ~24 units left of the reticle.
  yOffset: 0,     // ponytail: silhouette verts already touch y=0, the horizon the ROM beam starts on. No baseline shift.
  volcanoX: 3067, // ponytail: lowest point of the cone's crater rim (3056:96, 3059:89, 3064:94, 3067:88, 3072:96)
  volcanoY: 88,   // ponytail: that rim, so the rocks leave the crater instead of a notch elsewhere on the range
};

// Field phosphor. The red overlay stays red. Lines carry their own color; disco is the
// green base plus the per-object colors scene.js assigns.
export const PHOSPHOR = {
  green: [0.25, 1.0, 0.35],
  amber: [1.0, 0.55, 0.04], // ponytail: amber vector phosphor, hotter than the red overlay
  disco: [0.25, 1.0, 0.35],
};

export const DISCO = {
  white: [1, 1, 1],
  flipMin: 0.5, flipMax: 1.5, // obstacle recolor interval (s), kept under 3 flashes/s (photosensitivity limit)
  moon: [1.0, 0.6, 0.05],     // cheddar
  browns: [[0.9, 0.45, 0.15], [0.7, 0.35, 0.12], [1.0, 0.62, 0.3], [0.55, 0.28, 0.1]],
  blossom: [1.0, 0.45, 0.7], blossomPx: 10,
  trailStep: 200,   // world units between recorded trail points
  trailBreak: 2000, // a jump longer than this starts a new strand
  trailLife: 5,     // seconds for a trail point to fade out
  trailGauge: 460,  // half the distance between the treads (ROM tread meshes sit at x +-552)
  trailBand: 110,   // half the width of each tread print
  rainbowLen: 6000, // world units per full rainbow cycle
  sparkRate: 40,    // sparks per second per shell
  sparkLife: 0.5,   // seconds for a spark to fade out
  sparkSpread: 600, // max sideways spark speed (world units/s)
  sparkLift: [300, 1200], // min/max upward spark speed
  silver: [0.85, 0.9, 1.0],      // mirror-ball hull
  glintEvery: 0.2, glints: 3,    // facet glints reshuffle every glintEvery seconds
  spotRadius: 500,               // pool of light where a rim cone meets the ground
  skyLen: 9000,                  // sky cone length
  skyCone: 0.12,                 // sky cone radius at its tip, as a fraction of its length
  coneRays: 8, coneRay: 0.5,     // rays per light cone, and each ray's share of the beam brightness
  beamFade: [1.2, 0.9, 0.6, 0.3], // piece brightness, source to tip
  ballY: 240, ballR: 600,        // mirror ball centre height above the saucer origin, and radius (view units)
  ballSpin: 0.6,                 // rad/s the ball turns
  ballGrid: [12, 8],             // facet grid: longitudes, latitude bands
  ballCones: 10,                 // light cones thrown from facets
  coneLats: [-0.9, -0.45, 0.5],  // facet latitudes (rad) the cones cycle through; negative lands on the ground
  cableLen: 12000,               // cable from the top of the ball into the sky
  specks: 48, speckMax: 1.2, speckSize: 70, // ground light specks: count, max angle from straight down (rad), cross half-size
  hueCycle: 1,                   // hue units/s every beam drifts (full rainbow every 6 s)
  sparkGravity: 3000, // world units/s^2
  sparkStreak: 0.04, // seconds of travel each streak covers
  glass: [0.8, 0.9, 1.0],        // blue-white crack color
  glassRings: [70, 150, 260, 400], // ring radii (AVG units)
  glassRingDelay: 0.35, // seconds until the first ring shows (ROM cracks finish at 8/24 s)
  glassRingStep: 0.08,  // seconds between rings
  glassSpokes: 10,      // extra jagged spokes: the ROM cracks cross each ring only 3-8 times, too few for a web
};

export function nextPhosphor(name) {
  const names = Object.keys(PHOSPHOR);
  return names[(names.indexOf(name) + 1) % names.length];
}

// ponytail: DrawScoreLives beams to (+128, +360). The life VJSR does not restore the beam; it ends at x=+57.
export const HUD = { livesX: 128, livesY: 360, livesSpacing: 57 };

export const PLAYER = {
  speed: 192 * TICK,            // both treads forward: 2 steps of 96 u per tick
  turnRate: 2 * STEP * TICK,    // treads opposed: 2 rotation steps per tick (~22°/s)
  collideRadius: 1152,          // unit-vs-unit
  hitRadius: 640,               // ponytail: enemy shell vs player. ROM radius is facing-dependent, about 224–400. Tune by feel.
};

// muzzle 0: the ROM copies the firer's position. The near plane hides a shell still at the camera.
export const SHELL = { speed: 1020 * TICK, life: 127 / 4 / TICK, muzzle: 0, maxSubstep: 200 };

export const OBSTACLE = {
  unitRadius: { 0: 832, 1: 832, 12: 1024, 15: 960 }, // ROM obstacle_radius table
  // obst_proj_diam ($6139) compared with distance/4. Short box is 0.
  shellRadius: { 0: 224, 1: 352, 12: 344, 15: 0 },
};

// U key spawns saucers ahead of the player: cap, distance range, max angle off the heading (rad).
export const UFO_KEY = { max: 8, near: 6000, far: 12000, spread: 0.44 };
export const ENEMY = {
  hitRadius: 800, // ponytail: ROM varies this with facing (about 224–400); one circle until it feels wrong
  tank: { speed: 192 * TICK, turnFast: 2 * STEP * TICK, turnSlow: STEP * TICK, standoff: 1280, score: 1000 },
  super: { speed: 384 * TICK, turnFast: 4 * STEP * TICK, turnSlow: 2 * STEP * TICK, standoff: 2048, score: 3000 },
  missile: {
    speed: 512 * TICK, spawnAlt: 6144, fallRate: 256 * TICK, hittableBelow: 512, contactRadius: 1152,
    zigAmp: 31 * A, zigRamp: 2, zigFlip: 8 / TICK,
    zigStopDist: 6400, // ponytail: ROM formula depends on score; fixed until play-tested
    score: 2000,
  },
  saucer: { maxVel: 255 * TICK, retargetMax: 8, delayMax: 16, minScore: 2000, score: 5000 },
  aimTolerance: 2 * STEP,
  noFireFor: 2,
  alwaysFireAfter: 255 / TICK,
  fireAnyScore: 2000,
  closeRange: 9216,
  homingAfter: 255 / TICK,
  reverseFor: 3,
  aggressiveLead: 5000,
  aggressiveReaim: 4 / TICK,
  spawnDist: 24600,
  spawnSpreadNarrow: 15 * A,
  spawnSpreadWide: 120 * A,
  wideSpawnLead: 7000,
  spawnDelay: 2,
  respawnHold: 48 / TICK,
  missileReplaceDist: 32768,
};

export const RULES = {
  lives: 3,
  bonusAt: [15000, 100000],
  missileScore: 10000,
  superAfterMissiles: 6,
  deathPause: 30 / TICK, // ROM: (46-16)=30 logic frames, ~2 s
  enemyKillBonus: 1000,
  alwaysAggressiveScore: 100000,
};

export const RADAR = { range: 32768, sweepRate: 11 * A * TICK, radiusUnits: 64 };
export const MESSAGES = { sideAngle: 22 * A, rearAngle: 107 * A, blockedShow: 1, blinkHz: 2 };
