import { createVectorRenderer } from './render/gl.js';
import { createLineBuffer, makeCamera, drawBackground, drawWorld, drawModel } from './render/scene.js';
import { createGame, step } from './game.js';
import { createInput } from './input.js';
import { mulberry32 } from './math.js';
import { SHAPES } from './data/rom.js';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
const canvas = document.getElementById('screen');
let renderer;
try {
  renderer = createVectorRenderer(canvas);
} catch (err) {
  document.getElementById('error').textContent = `This game needs WebGL2 (${err.message})`;
  throw err;
}
const buf = createLineBuffer(), input = createInput();
const app = { game: createGame({ rng: mulberry32(seed) }), t: 0, shape: 0 };
window.__bz = app; // debug handle for browser verification

function framePlay(inp, dt) {
  const g = app.game;
  step(g, inp, dt);
  const cam = makeCamera(g.player.x, g.player.z, g.player.facing, g.jolt);
  drawBackground(buf, cam, dt);
  drawWorld(buf, g, cam, app.t);
}

const SHAPE_NAMES = Object.keys(SHAPES);
function frameShapes(inp) {
  if (inp.fire) app.shape = (app.shape + 1) % SHAPE_NAMES.length;
  const cam = makeCamera(0, 0, 0);
  drawBackground(buf, cam, 0);
  drawModel(buf, cam, SHAPES[SHAPE_NAMES[app.shape]], 0, 0, 4000, app.t);
}

let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  app.t += dt;
  const inp = input.read();
  if (inp.fullscreen) (document.fullscreenElement ? document.exitFullscreen() : canvas.requestFullscreen()).catch(() => {});
  buf.clear();
  if (params.get('view') === 'shapes') frameShapes(inp);
  else framePlay(inp, dt);
  renderer.draw(buf, dt);
  requestAnimationFrame(frame);
});
