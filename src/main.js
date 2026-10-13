import { createVectorRenderer } from './render/gl.js';
import { createLineBuffer, makeCamera, drawBackground, drawWorld, drawModel, inView } from './render/scene.js';
import { createHudState, updateHudState, drawHud, drawAttractText, drawInitials, drawText } from './render/hud.js';
import { createGame, step } from './game.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadScores, saveScores, rankFor, insertScore } from './highscores.js';
import { mulberry32 } from './math.js';
import { MODEL_Y_SCALE } from './config.js';
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
const buf = createLineBuffer(), input = createInput(), audio = createAudio();
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => audio.unlock());

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
// Letter height is stored on Z, so the brief's yaw leaves the title flat on the horizon.
// Swap that axis onto Y (travel axis). Divide by MODEL_Y_SCALE: Z is already in the doubled
// X/Z space that scale matches. Flip X because facing + π would otherwise mirror the word.
// logoTtle/logoZone strokes are stored at intensity 0; the ROM overrides that while drawing the logo.
const LOGO = [SHAPES.logoBa, SHAPES.logoTtle, SHAPES.logoZone].map((shape) => ({
  verts: shape.verts.map(([x, y, z]) => [-x, z / MODEL_Y_SCALE, -y]),
  segs: shape.segs.map(([a, b, i]) => [a, b, i || 30]),
}));
const attractWorld = createGame(); // never stepped: just the obstacle field for the backdrop
const app = {
  mode: params.get('view') === 'shapes' ? 'shapes' : 'attract',
  scores: loadScores(), game: null, hud: createHudState(), t: 0, modeT: 0, overFor: 0, entry: null, shape: 0, games: 0,
};
window.__bz = app; // debug handle for browser verification

const setMode = (mode) => { app.mode = mode; app.modeT = 0; };
const silence = () => audio.update({ on: false });

function frameAttract(inp, dt) {
  silence();
  const cam = makeCamera(0, 0, app.modeT * 0.15);
  drawBackground(buf, cam, dt);
  drawWorld(buf, attractWorld, cam, app.t);
  const d = Math.max(9000, 40000 - app.modeT * 8000); // logo flies in, then holds
  for (const shape of LOGO) drawModel(buf, cam, shape, Math.sin(cam.facing) * d, 0, Math.cos(cam.facing) * d, cam.facing + Math.PI);
  drawAttractText(buf, app.modeT, app.scores);
  if (inp.start) {
    app.game = createGame({ rng: mulberry32(seed + app.games++) });
    app.hud = createHudState();
    app.overFor = 0;
    setMode('play');
  }
}

function framePlay(inp, dt) {
  const g = app.game;
  const events = step(g, inp, dt);
  const cam = makeCamera(g.player.x, g.player.z, g.player.facing, g.jolt);
  if (updateHudState(app.hud, g, dt)) events.push({ type: 'radarPing' });
  audio.handle(events);
  audio.update({
    on: !g.over,
    engine: g.player.alive ? (Math.abs(inp.left) + Math.abs(inp.right)) / 2 : 0,
    saucer: !!g.saucer && !(g.saucer.dying > 0) && inView(cam, g.saucer.x, g.saucer.z),
    missile: g.enemy?.kind === 'missile',
  });
  drawBackground(buf, cam, dt);
  drawWorld(buf, g, cam, app.t);
  drawHud(buf, g, app.hud, Math.max(app.scores[0].score, g.score), app.t);
  if (g.over && (app.overFor += dt) > 3) {
    if (rankFor(app.scores, g.score) >= 0) {
      app.entry = { letters: [0, 0, 0], pos: 0, armed: true };
      setMode('initials');
    } else setMode('attract');
  }
}

function frameInitials(inp) {
  silence();
  const e = app.entry, turn = (inp.left - inp.right) / 2;
  if (Math.abs(turn) < 0.5) e.armed = true;
  else if (e.armed) {
    e.armed = false;
    e.letters[e.pos] = (e.letters[e.pos] + Math.sign(turn) + LETTERS.length) % LETTERS.length;
  }
  if (inp.fire && ++e.pos === 3) {
    app.scores = insertScore(app.scores, app.game.score, e.letters.map((i) => LETTERS[i]).join('').trimEnd());
    saveScores(app.scores);
    setMode('attract');
    return;
  }
  drawInitials(buf, e, LETTERS, app.t);
}

const SHAPE_NAMES = Object.keys(SHAPES);
function frameShapes(inp) {
  if (inp.fire) app.shape = (app.shape + 1) % SHAPE_NAMES.length;
  const cam = makeCamera(0, 0, 0);
  drawBackground(buf, cam, 0);
  drawModel(buf, cam, SHAPES[SHAPE_NAMES[app.shape]], 0, 0, 4000, app.t);
  drawText(buf, SHAPE_NAMES[app.shape].toUpperCase(), -200, -300, 1, 1);
}

const FRAMES = { attract: frameAttract, play: framePlay, initials: frameInitials, shapes: frameShapes };
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  app.t += dt;
  app.modeT += dt;
  const inp = input.read();
  if (inp.fullscreen) (document.fullscreenElement ? document.exitFullscreen() : canvas.requestFullscreen()).catch(() => {});
  buf.clear();
  FRAMES[app.mode](inp, dt);
  renderer.draw(buf, dt);
  requestAnimationFrame(frame);
});
