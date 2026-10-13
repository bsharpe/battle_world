# Battlezone Web — Design

Source facts: `docs/research.md`.

## Decisions
| Area | Choice |
|---|---|
| Frame | 1920x1080, 16:9. Vertical FOV matches the original (73.7°); horizontal widens 90° → ~106°. The red HUD strip covers the top 216 px at full width. |
| Fidelity | Arcade rules, enemies, ROM shapes and obstacle layout. Physics runs per frame on `dt`. ROM per-tick values are converted ×15.625 to per-second. |
| Renderer | WebGL2 with a custom line-quad shader (Gaussian falloff), additive blend, a phosphor persistence buffer and a bloom pass. |
| Controls | Arcade keyboard (WASD/arrows), authentic tread mode (Q/A left, P/L right), and gamepad (sticks = treads). |
| Stack | Vanilla ES modules, no build step and no runtime deps. Tests use `node --test`. Served via `npx serve` or any static server. |

## Units (ROM world units "u", seconds)
- Player: move 3000 u/s; pivot 22°/s; body radius 1152.
- Shell: 15,940 u/s, TTL 2.03 s, one in flight per side.
- Slow tank: 3000 u/s, turn 22°/s, stand-off 1280. Super tank: 6000 u/s, turn 44°/s, stand-off 2048.
- Missile: up to 8000 u/s, spawn alt 6144 and drop 4000 u/s, hittable below alt 512.
- Saucer: drift up to ±4000 u/s per axis.
- Obstacle radii: 832 / 832 / 1024 / 960.

## Layout
```
index.html            canvas 1920x1080, CSS-scaled to fit the window (letterboxed)
src/main.js           boot, game loop (rAF, dt clamp), state machine: attract | play | dying | initials
src/data/*.js         GENERATED from ROM disassembly: shapes, obstacles, vector font
src/game.js           world state + update(dt): player, enemy, saucer, shells, collisions, scoring, lives
src/ai.js             enemy steering/fire decisions, spawn director (pure functions of state)
src/render/gl.js      WebGL2: line-quad batch, persistence + bloom passes, green/red tint by y
src/render/scene.js   3D → line list: camera, clip at near plane, background, models, debris, HUD, radar, text
src/audio.js          Web Audio synth: engine, cannon, explosion noise, radar ping, saucer, missile, fanfare
src/input.js          keyboard modes + Gamepad API → {left, right, fire} tread values in [-1, 1]
tools/extract-rom.mjs fetches the 6502disassembly listing and emits src/data/*.js
test/*.test.js        node --test on game.js / ai.js logic
```

## Key mechanics
- **Treads to motion:** `fwd = (L+R)/2`, `turn = (R-L)/2`. Keyboard arcade mode synthesizes L and R from forward and turn input.
- **Collision:** circle vs circle on the XZ plane. Hitting an obstacle restores the previous position, jolts the horizon and shows "MOTION BLOCKED BY OBJECT".
- **Shells:** checked against obstacle radii (short box excluded), then the enemy radius, which depends on facing.
- **Spawn director:**
  - One ground/air enemy at a time.
  - A 50% missile chance once score reaches 10K.
  - Super tanks after the 6th missile.
  - A saucer from 2K.
- **Death:** windshield cracks, ~2 s pause, respawn at a random clear spot.
- **Lives:** 3; bonus tanks at 15K and 100K. High scores (top 10, 3 initials) are kept in `localStorage`.

## Build phases (each ends with a browser screenshot + passing tests)
1. **ROM data lever:** `tools/extract-rom.mjs` emits the shapes, obstacles and font. Verify with a debug shape-viewer.
2. **Renderer + world:** WebGL vector pipeline. Drivable tank among obstacles with mountains, moon, horizon and reticle.
3. **Combat core:** shells, the slow tank and its AI, death/respawn, score, lives, HUD, radar and messages.
4. **Full roster:** missile, super tank, saucer, spawn director and difficulty.
5. **Audio.**
6. **Shell:** attract mode, high-score entry, input modes and gamepad, volcano, debris, persistence tuning.
