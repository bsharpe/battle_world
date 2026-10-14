# How this was made

Prompt history for the browser game, taken from the session transcripts of 12–14 October 2026. Quotes are the user's words. The design, the research notes, and the implementation plan are the specs those prompts produced. This file is the sequence.

Four sessions:

- Claude, 12–13 October. Research, then the plan.
- Grok, 13 October. "Battlezone plan review and spec corrections."
- Grok, 13 October. "Implement game with subagents and review work," then the first round of look changes.
- Grok, 13–14 October. "Volcano particle bloom and Battle World title," then the frame, hidden lines, and the deploy.

## The first prompt

13 October is the plan. The project starts the evening before, in Claude:

> this is a new project to create a web-version at 1920x1080 of the classic Arcade game BattleZone -- research the web for rules, look & feel, enemies, and general gameplay, then we'll implement a web version

That pass wrote `docs/research.md` from the arcade sources below. The next typed request, the next morning, was:

> create a plan for the project and save it

That wrote `docs/design.md` and `docs/superpowers/plans/2026-10-13-battlezone.md`. The plan is twelve tasks: ROM extract, math, movement, enemy AI, combat, input, the WebGL2 line renderer, the 3D scene, HUD, audio, high scores and attract mode, then tread, dish, and volcano polish.

## Prompts that changed the spec before any game code

> review the plan for this project

> update the spec with your adjustments

The review rewrote the design, the research notes, and the plan so they agreed. The adjustments that stuck: the reticle test expects 8 visible strokes; shells spawn at the firer; obstacle shell radii are 224, 352, 344, and 0; the death pause is about 2 seconds; turn is `(L−R)/2`, so left tread forward and right tread back turns right; landscape scroll uses the camera focal length and the HUD stays on the original AVG scale; a missile at altitude 512 or higher is not in range; a 5,000-point lead only shortens re-aim; the volcano marker is the lowest vertex in the ROM window; the radar dish yaws with the tank; the 1812 fanfare plays on the 100K bonus tank only.

## The build

> I want you to implement the game described in this folder using subagents where applicable; please review each subagents work to make sure it successfully did what was asked

One implementer per task, then a reviewer, with a fix loop, then a whole-branch review. The game landed on the `battlezone-web` worktree. Shapes, obstacles, the font, and string positions come from the generated `src/data/rom.js`. Rules live in plain modules and advance by `dt`. The picture is a list of line segments drawn as phosphor.

## Prompts that changed the picture

After the twelve tasks, the look was adjusted from screenshots.

> fyi -- i want the option to change the main color of the renderer from green to amber; and eventually a "disco" option that is multicolored

C cycles green and amber. The choice sticks in `localStorage` and can be forced with `?color=`. The red score band stays red. Disco was left for later, because one tint colors the whole field.

> the preview looks really fuzzy -- is that on purpose? or an artifact from scaling? can we not scale the image?

The fit-to-window CSS scale was blurring the lines on top of the phosphor glow. The canvas was then shown at one device pixel per backing-store pixel.

> [Image #1] - move the title up to the top of the screen with some adequate padding; - the volcano rocks (left) are not coming out of the volcano (right); - put "Press Start" above the copyright notice

The title moved to the top. Press Start moved above the copyright line. The rocks had been spawning about 90 degrees left of the cone; the crater is the lowest landscape vertex in the ROM window (`volcanoX` 3067, `volcanoY` 88).

> the title is flipped for some reason

The attract logo had a mirrored X. Dropping that negation put BATTLE / ZONE back left to right.

> ok -- why is it still so fuzzy?

> there should be no bloom on text

World lines kept a tighter glow. Glyphs and the wordmark moved to a stroke that runs after the bloom pass, so the lettering has no halo.

> we need an non-copyrighted name for this too -- instead of BattleZone -- maybe Battle World? -- or something you come up with

Four names were offered and nothing was renamed yet. The later, explicit choice was:

> need to change the title in the game from "Battle Zone" to "Battle World"

The ROM logo lettering came off the attract screen. The title is the game font, BATTLE over WORLD. The page title is Battle World.

> the dots on the radar need to have a lot of bloom; they're too small to see

> too much bloom on the radar blip -- dial it back by about 75%

Radar blips became wide dots, then the glow was cut to about a quarter.

> the saucer should explode when hit

A hit is immediate wreckage. The arcade's roughly two-second fade is gone.

> allow keyboard input when accepting high score name

Initials can be typed. C, T, and F do not change phosphor, tread mode, or fullscreen while a name is being entered.

> Game over should be about 2x bigger

GAME OVER is drawn at full glyph scale.

> the particle emitter particles for the volcano need more bloom on them -- they're very hard to see

Volcano rocks are the same wide bloom dots as the radar blip. The global bloom was left alone.

> we should remove the old atari copyright message on the title page

The attract screen no longer draws the ROM copyright line. The bonus-tank line stays. The string is still in the ROM table.

> why doesn't it fill my web screen?

On a retina display the canvas was locked to bitmap size over device pixel ratio, so it sat at half the window. The follow-up was:

> cna we get the canvas to fit as good as possible on a retina display -- or 2x it to fit the retina display?

The picture stays 1920×1080. The bitmap is up to twice that. CSS is the largest 16:9 box in the window, so the fit is a downscale of a sharp buffer.

> is it possible to make the objects in the world solid, so you can't see lines that are behind them, through them?

> yes, the hidden-line version

The blend is additive, so a black fill cannot hide a line. Hidden spans are clipped on the CPU, against the front faces of each solid, before they enter the line buffer. The horizon and the mountains stop at the silhouette. The near side of a tank, including the gun, still draws.

## Shipping

> can you deploy this on battleworld.instituteofmayhem.com

> it's on cloudflare

> wrangler is already installed

The Worker `battle-world` serves `index.html` and `src/` as static assets on that hostname. Tests, docs, and the ROM extractor are not published. Wrangler was the copy already on the PATH.

## External tools

Research sources, fetched during the first session. The research agents had no web-search tool, so the pages were read with curl.

- Andy McFadden's rev-2 disassembly, https://6502disassembly.com/va-battlezone/ (listing, objects, strings). This is the source of shapes, obstacles, the font, and most of the rules. `tools/extract-rom.mjs` turns that listing into `src/data/rom.js`.
- Wikipedia, Battlezone (1980).
- MAME `src/mame/atari/bzone.cpp` and `bzone_a.cpp`, for DIP defaults.
- Killer List of Videogames, the Battlezone entry.

Development tools.

- Claude Code, with the superpowers writing-plans skill, for the research and the plan.
- Grok, with one implementer subagent and one reviewer per plan task, for the game and every later change.
- Node's built-in test runner (`node --test`).
- `python3 -m http.server` on port 8080, serving the worktree.
- Headless Chrome, driven over the DevTools protocol, for screenshots of the attract screen, play, death, initials, the retina fit, and hidden-line shots.
- codebase-memory, indexed on the web worktree, for later lookups.
- Cloudflare Wrangler 4.149.0, already installed, to publish the Worker.

## How long it took

From the first prompt to the Worker going live was 27 hours 23 minutes.

The first prompt is timestamped 2026-10-12 21:34 UTC (3:34 pm Mountain). Wrangler finished the deploy at 2026-10-14 00:57 UTC (6:57 pm Mountain on the 13th). The live check of https://battleworld.instituteofmayhem.com came back a few seconds later.

Two pauses sit inside that span. The research session closed at 21:41 UTC on the 12th, and the next prompt, asking for the plan, arrived at 11:44 UTC on the 13th: 14 hours 3 minutes. The build session then ran until 19:09 UTC, sat until 21:23 UTC (2 hours 14 minutes), and ran again until 22:18 UTC. The polish session started at 22:21 UTC and deployed at 00:57 UTC.

The sessions themselves add up to about 11 hours: 7 minutes of research, 22 minutes to write the plan, 34 minutes to review it, 7 hours 23 minutes to build and adjust the picture, and 2 hours 37 minutes from the volcano-bloom prompt through the deploy.
