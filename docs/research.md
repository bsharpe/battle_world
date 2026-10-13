# Battlezone (Atari 1980) — Research Notes

Primary source: Andy McFadden's rev-2 ROM disassembly, https://6502disassembly.com/va-battlezone/
(Battlezone.html listing, objects.html shapes, strings.html). Secondary: Wikipedia, MAME `src/mame/atari/bzone.cpp` / `bzone_a.cpp`.
"[code]" = derived from disassembly routines by a research agent, not play-verified.

## Timing & units
- Logic tick 15.625 Hz (250 Hz NMI / 16). Display ~41.7 Hz. Speeds below are per logic tick.
- World coords 16-bit signed (x, z) ±32768, plus altitude. No explicit wrap found.
- Facing: 16-bit, hi byte 256 = 360° (1 "A" = 1.406°). Rotation step = 0.703°.
- Screen space ~1024x768 (±512, ±384), origin center.

## Core rules
- Lives: 2/3/4/5 (default 3). Bonus tank at 15K/25K/50K (default 15K) and 100K. Missiles start at 5K/10K/20K/30K (default 10K).
- Player dies from enemy shell or missile contact. Tank contact only blocks.
- Death: windshield cracks (up to 16, `vg_hit_cracks`), ~30 tick pause, horizon jolt. Respawn at random position/facing clear of obstacles; enemy move timer 48 ticks; live missile replaced by tank.
- Game over → high-score entry (10 entries, 3 initials; defaults 5,000 / EDR MPH JED DES TKE VKB EL HAD ORR GJR).

## Player
- Two treads (left/right stick, fire on right). Both fwd/back: 2 move steps/tick × 96 u = 192 u/tick. Opposite: pivot 2 rot steps/tick (~1.41°/tick ≈ 22°/s). One stick: 1 turn + 1 move step.
- Body radius 1152 u. Blocked by obstacle → position restored, horizon jolt, "MOTION BLOCKED BY OBJECT".
- One shell in flight. Shell: ~1020 u/tick, TTL ~32 ticks (~2 s), range ~32.5K u. Enemy shells identical. Position is copied from the firer; the shell is not drawn until it passes the near plane.

## Enemies (one ground/missile enemy at a time + at most one saucer; all die in one hit)
| Enemy | Points | Appears | Movement |
|---|---|---|---|
| Slow tank | 1000 | start | 192 u/tick straight, advances only if >1280 u away; turn 22°/s (11°/s near-aligned). Random heading first ~16 s then homes. Re-aim every 4 ticks if player leads by ≥5K. Reverses 3 s after hitting obstacle. |
| Missile | 2000 | score ≥ missile threshold: 50% of spawns | Spawns ~24K u out at alt 6144, drops 256/tick. Up to 512 u/tick. First one straight; later zigzag ±0→44° over 2 s, flip every 8 ticks, stop zigzag when close. Hittable only when alt < 512. Hops low obstacles. Contact kills. |
| Super tank | 3000 | after 6th missile launch | 384 u/tick, advances only if >2048 u, turns 44°/s. |
| Saucer | 5000 | score ≥ 2000, random 0–16 s delay | Random drift ±255 u/tick per axis, re-randomized every 0–8 s. Never fires, not on radar, silent off-screen. Fades ~2 s when hit. |

- Spawn: ~24.6K u (halved on coin flip); bearing ±15 A early, ±120 A when player leads by ≥7K.
- Enemy fire: one shell; only when barrel within 2 steps of player bearing; none first ~2 s; always fires after ~16.3 s; before that needs score ≥2000 or (within 45° and < 9216 u). Score ≥100K: always aggressive.
- Enemy kills add 1000 to hidden enemy score.

## Obstacles
- 21 fixed, identical every game (ROM table), spread over ±32K.
- Against units: narrow pyramid r 832, tall box r 832, wide pyramid r 1024, short box r 960.
- Against shells, `obst_proj_diam` ($6139) is compared to distance/4: narrow `$38` → 224, tall `$58` → 352, wide `$56` → 344, short `$00` → 0.

## Radar & messages
- Sweep ~15.5°/tick (~1.5 s/rev), blip for tank/missile only within 32,768 u, brightens + ping as sweep passes.
- "ENEMY TO LEFT/RIGHT" when bearing ≥31° off nose; "REAR" ≥150°. Blinks. "ENEMY IN RANGE" when targetable. Half-size text.

## Display / look
- Monochrome vector; red overlay top ~1/5 (score, lives, radar), green below. Horizon at screen center.
- Reticle: two shapes — idle and "on target" (angled), idle can flash.
- FOV: visible if |x| < z (±45° half-angle → 90° total). Background strip 4096 u with 1024 visible.
- Background: 8 × 512-u mountain sections, crescent moon (ahead at start), volcano visible ~80°–191° facing, up to 5 particles.
- 44 shapes with exact vertex data (signed 16-bit XYZ, ≤26 verts): slow tank $02, super tank $21, missile $16, saucer $20, projectile $03, shell explosion $0E, treads $04–$0B (animate, reverse), radar dish $0D, debris chunks $10–$1D (spin about Y only), logo $17/$1E/$1F.
- Lines vary in intensity; distant objects dimmer; phosphor persistence.

## Sound (no music)
- Engine: discrete saw/square, frequency follows motor rev, gated by motion.
- Cannon: loud (player) / soft (enemy). Explosion: LFSR noise ~12 kHz clock, loud on player hit.
- POKEY: radar ping, saucer hum (ch1), collision "merp", extra life = 4 beeps, new enemy = 3 boops, missile buzz (ch3/4).
- 9-note 1812 Overture fanfare on the 100K bonus. KLOV attributes it to high-score entry; rev-2 plays it on the bonus, and this project follows the code.

## Attract mode
- Alternates AI demo, high-score table, logo. Strings: "PRESS START", "INSERT COIN", "(C)(P) ATARI 1980", "GREAT SCORE", "BONUS TANK AT ...", "ENTER YOUR INITIALS".

## Open questions
- Exact HUD pixel positions (computed in code) — approximate from screenshots.
- POKEY frequencies — tune by ear.
- Saucer despawn (code: none). 100K super-tank "retreat" (Wikipedia; not in rev-2 code).
