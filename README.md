# Battle World

A browser recreation of the beloved 1980 vector tank game **Battlezone**, built as a personal experiment in making games with AI.

The goal is simple: practice building with AI, learn by replicating a favorite arcade game, and have fun along the way. This is an ongoing hobby project, with arcade-inspired rules and visuals that can be refined through play and experimentation.

[Play Battle World](https://battleworld.instituteofmayhem.com/) · [Institute of Mayhem](https://instituteofmayhem.com/)

## What's here

- A WebGL2 vector renderer with phosphor glow, persistence, and hidden-line occlusion.
- Tanks, missiles, saucers, obstacles, radar, and synthesized Web Audio effects.
- Keyboard and gamepad controls, plus local high scores.
- Plain JavaScript modules, no runtime dependencies, and tests using Node's built-in test runner.

## Run locally

You need Python 3 to serve the game and a modern browser with WebGL2 support.

```sh
git clone https://github.com/bsharpe/battle_world.git
cd battle_world
npm run serve
```

Open http://localhost:8080. No dependency installation or build step is required to play locally.

## Controls

| Key | Action |
| --- | --- |
| Enter | Start a game |
| WASD or arrow keys | Move and turn |
| Space | Fire |
| T | Toggle authentic tank-tread controls |
| Q / A | Left tread forward / reverse in tread mode |
| P / L | Right tread forward / reverse in tread mode |
| C | Cycle green / amber phosphor |
| F | Toggle fullscreen |

Gamepads also support tread movement with the sticks, firing, and starting a game. On the high-score screen, type your initials and press Enter.

## Development

With a modern Node.js installation:

```sh
npm test
```

Game logic lives in `src/game.js` and `src/ai.js`; rendering lives in `src/render/`. See [the project story](docs/project-process.md) for the prompts and process behind the game, and [design notes](docs/design.md) and [research notes](docs/research.md) for the mechanics and implementation background.

`src/data/rom.js` contains generated shape, font, and layout data derived from Andy McFadden's [annotated Battlezone disassembly](https://6502disassembly.com/va-battlezone/). To regenerate it from that source:

```sh
npm run extract
```

## Deployment

The game is served as static assets by Cloudflare Workers. With Wrangler installed and authenticated:

```sh
npm run deploy
```

This stages the site in `dist/` and deploys using `wrangler.jsonc`. To host your own copy, update that configuration with your own account, Worker name, and domain first.

## Credits and license

Created by Ben Sharpe as an AI-assisted learning project. Battlezone was created by Atari; this is an unofficial fan recreation. Thanks to Andy McFadden for the annotated disassembly used as a research and data source.

Original code written for this project is available under the [MIT license](LICENSE). The license does not grant rights to Atari's original game data, artwork, or trademarks, or to third-party source material.
