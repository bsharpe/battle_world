# Building Battle World with AI

Battle World began with a favorite arcade game and a straightforward goal: practice building with AI, recreate the experience of playing Battlezone, and have fun. Between October 12 and 14, 2026, that idea became a playable browser game, a published website, and a public source repository.

[Play the game](https://battleworld.instituteofmayhem.com/) · [Browse the source](https://github.com/bsharpe/battle_world)

This account draws on the original local Claude session, the saved research and implementation documents, Git history, and the later Codex conversation used to finish branding and publication. Quoted user prompts are recovered wording. Research prompts are identified separately as instructions written by the assistant. The implementation story follows the recorded plan and commits; it does not imply that every development conversation was recovered.

## 1. Start with the experience, then research it

The opening user prompt on October 12 set both the destination and the first step:

> this is a new project to create a web-version at 1920x1080 of the classic Arcade game BattleZone -- research the web for rules, look & feel, enemies, and general gameplay, then we'll implement a web version

That request made research part of development. Recreating a remembered game requires more than drawing a tank: movement, enemy behavior, radar, sound, scoring, and the distinctive vector display all contribute to the experience.

The assistant split the research into gameplay and presentation. Two excerpts from those agent-written prompts show the intended level of detail:

> Research the 1980 Atari arcade game "Battlezone" (Ed Rotberg) on the web. Goal: precise facts to faithfully reimplement the gameplay in a browser.

> Report concrete details (cite source URL per fact; mark anything uncertain)

The gameplay request covered lives, bonus tanks, enemy point values and behavior, shooting, obstacles, difficulty progression, radar, tread controls, and world layout. The presentation request began:

> Research the look, feel, and presentation of the 1980 Atari arcade game "Battlezone" for a faithful browser reimplementation at 1920x1080.

It asked about the green vector display and red HUD overlay, wireframe models, animated treads, cracked windshield, debris, mountains, volcano, moon, sounds, and attract screens.

The research identified Andy McFadden's [annotated Battlezone disassembly](https://6502disassembly.com/va-battlezone/) as a particularly useful source. It supplied concrete rules and original vector data. Findings went into [research.md](research.md), with design decisions recorded in [design.md](design.md).

## 2. Turn the research into an executable plan

On October 13, the user gave a short follow-up:

> create a plan for the project and save it

The resulting [implementation plan](superpowers/plans/2026-10-13-battlezone.md) defined twelve tasks, from data extraction through final polish. It specified file responsibilities, interfaces, tests, and checks for likely failures such as world wrapping, respawning inside obstacles, returning from a background tab, and holding the fire button.

The architecture kept game rules separate from presentation. Plain JavaScript modules advance a game state; rendering converts that state into lines; WebGL2 draws the lines with phosphor effects. Web Audio synthesizes sounds, and keyboard and gamepad input drive the tank.

This gave the AI a concrete sequence of deliverables and made each stage easier to inspect. The project also stayed small: static files, no bundler, and no runtime dependencies.

## 3. Recover the original data and build the playable core

The first implementation milestone was an extractor that reads the published disassembly and generates `src/data/rom.js`. It recovers shapes, obstacle positions, vector glyphs, and display elements. A shape viewer provided a way to inspect that data in the browser.

Git history then records the game taking shape in manageable steps:

| Stage | Result |
| --- | --- |
| World math and constants | Coordinates, bearings, wrapping, and arcade timing expressed in browser-friendly units. |
| Player movement | Independent tank treads, turning, obstacle blocking, and world wrapping. |
| Enemy behavior | Tank steering and firing, missiles, saucers, and spawn progression. |
| Combat | Shells, collisions, scoring, bonus tanks, death, respawn, and game over. |
| Input | Familiar keyboard movement, authentic tread controls, and gamepads. |

Corrections accompanied the feature work. Commits fixed the extracted life icon, cleared shells after death, and corrected hits against missiles above the playable firing height. These were specific behavioral problems that could be checked against data or tests.

## 4. Give the game its arcade character

The next stages brought the experience together: a WebGL2 renderer with glow, persistence, bloom, and the red score band; a projected wireframe world; and a HUD with vector lettering, radar, messages, reticle, and windshield cracks.

Synthesized audio added engine, cannon, explosion, radar, and enemy sounds. Attract mode, initials entry, and persistent local high scores completed the surrounding game flow. Animated treads, a spinning radar dish, and an erupting volcano added motion and recognizable detail.

The commit history also shows visual refinement: keeping meshes intact across the world seam, aligning score digits, positioning the volcano, showing the title immediately, and tightening phosphor rendering. The browser title became **Battle World**.

Later changes improved how the 16:9 frame fits the window and uses high-density displays. Hidden-line occlusion made nearer objects conceal lines behind them. These refinements moved the project beyond having the right components toward making the scene read clearly during play.

## 5. Finish the title screen and publish

The later Codex conversation added the Institute of Mayhem identity using an existing example:

> i want to add the institute of mayhem logo/link to the title page -- look in the instituteofmayhem folder for an example

The first placement was adjusted after another user prompt:

> i think we usually put it in the lower-left corner -- but check pop! to see

Checking Pop! confirmed a lower-left badge, 16 pixels from the left and 32 pixels from the bottom, plus mobile safe-area insets. Battle World adopted the same placement. The badge links to the Institute in a new tab, appears only on the title screen, and supports keyboard focus.

The publication request was concise:

> commit; push; deploy

The project passed all 79 existing tests and a Wrangler deployment dry run. It was committed and deployed as static assets through Cloudflare Workers at [battleworld.instituteofmayhem.com](https://battleworld.instituteofmayhem.com/). The deployed HTML was checked against the local version.

There was initially no Git remote. The user then specified the public release:

> create a public remote repo on my account and push all relevant files with a readme explaining the goal of this project (practice building with AI, replicating a beloved game, having fun, MIT license)

A README, MIT license, and public GitHub repository followed, with the project files and development history pushed to `main`. The repository was subsequently renamed to [bsharpe/battle_world](https://github.com/bsharpe/battle_world) to match the game. The MIT license covers original project code; the README separately credits Atari and the disassembly source and distinguishes third-party material.

## What this process demonstrates

The user set the goal and steered the result; AI helped research, plan, implement, test, and publish. The most useful prompts gave a clear outcome, named the evidence to consult, or pointed to an existing example to verify. Even short requests worked when they referred to concrete artifacts and an established project context.

Research supplied a starting point, the saved plan divided the work, tests checked gameplay behavior, and successive fixes refined the experience. The result is a playable hobby project and a record of learning through AI-assisted development, with room for further playtesting and improvements.
