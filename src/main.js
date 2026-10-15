import { createVectorRenderer, bitmapSize, fitFrame } from './render/gl.js?v=17';
import { createLineBuffer, createDisco, updateDisco, makeCamera, drawBackground, drawWorld, drawModel, inView, worldOccluders, modelOccluders } from './render/scene.js?v=22';
import { createHudState, updateHudState, drawHud, drawAttractText, drawInitials, drawText, drawTitle } from './render/hud.js?v=15';
import { createGame, step } from './game.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadScores, saveScores, rankFor, insertScore, editInitials } from './highscores.js';
import { mulberry32 } from './math.js';
import { PHOSPHOR, nextPhosphor, VIEW } from './config.js';
import { SHAPES } from './data/rom.js';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
const canvas = document.getElementById('screen');
// Picture stays 1920×1080. The bitmap is up to 2× that, and CSS fits the 16:9 frame to the window.
const [bitmapW, bitmapH] = bitmapSize(VIEW.width, VIEW.height, window.devicePixelRatio);
canvas.width = bitmapW;
canvas.height = bitmapH;
const placeCanvas = () => {
  const [cssW, cssH] = fitFrame(VIEW.width, VIEW.height, window.innerWidth, window.innerHeight);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
};
placeCanvas();
addEventListener('resize', placeCanvas);
let renderer;
try {
  renderer = createVectorRenderer(canvas, { viewWidth: VIEW.width, viewHeight: VIEW.height });
} catch (err) {
  document.getElementById('error').textContent = `This game needs WebGL2 (${err.message})`;
  throw err;
}
const PHOSPHOR_KEY = 'battlezone.phosphor';
function loadPhosphor() {
  const q = params.get('color');
  if (PHOSPHOR[q]) return q;
  try {
    const saved = localStorage.getItem(PHOSPHOR_KEY);
    if (PHOSPHOR[saved]) return saved;
  } catch { /* private mode, or Node without a storage file */ }
  return 'green';
}
let phosphor = loadPhosphor();
const buf = createLineBuffer(), input = createInput(), audio = createAudio();
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => audio.unlock());

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
const attractWorld = createGame(); // never stepped: just the obstacle field for the backdrop
const app = {
  mode: params.get('view') === 'shapes' ? 'shapes' : 'attract',
  scores: loadScores(), game: null, hud: createHudState(), t: 0, modeT: 0, overFor: 0, entry: null, shape: 0, games: 0,
  phosphor,
};
window.__bz = app; // debug handle for browser verification

const iom = document.getElementById('iom');
iom.hidden = app.mode !== 'attract';
// Keep keyboard activation of the link from also starting a game.
iom.addEventListener('keydown', (event) => event.stopPropagation());
const setMode = (mode) => { app.mode = mode; app.modeT = 0; iom.hidden = mode !== 'attract'; };
const disco = createDisco();
const silence = () => audio.update({ on: false });

function frameAttract(inp, dt) {
  silence();
  const cam = makeCamera(0, 0, app.modeT * 0.15);
  const occ = worldOccluders(attractWorld, cam);
  const fx = app.phosphor === 'disco' ? disco : null;
  if (fx) updateDisco(fx, attractWorld, dt);
  drawBackground(buf, cam, dt, occ, fx);
  drawWorld(buf, attractWorld, cam, app.t, occ, fx);
  drawTitle(buf);
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
    saucer: !!g.saucer && inView(cam, g.saucer.x, g.saucer.z),
    missile: g.enemy?.kind === 'missile',
  });
  const occ = worldOccluders(g, cam);
  const fx = app.phosphor === 'disco' ? disco : null;
  if (fx) updateDisco(fx, g, dt);
  drawBackground(buf, cam, dt, occ, fx);
  drawWorld(buf, g, cam, app.t, occ, fx);
  drawHud(buf, g, app.hud, Math.max(app.scores[0].score, g.score), app.t, fx);
  if (g.over && (app.overFor += dt) > 3) {
    if (rankFor(app.scores, g.score) >= 0) {
      app.entry = { letters: [0, 0, 0], pos: 0, armed: true };
      setMode('initials');
    } else setMode('attract');
  }
}

function frameInitials(inp) {
  silence();
  const e = app.entry;
  if (editInitials(e, inp, LETTERS)) {
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
  const shape = SHAPES[SHAPE_NAMES[app.shape]];
  const occ = modelOccluders(cam, shape, 0, 0, 4000, app.t, 'shape');
  drawBackground(buf, cam, 0, occ);
  drawModel(buf, cam, shape, 0, 0, 4000, app.t, 1, occ, 'shape');
  drawText(buf, SHAPE_NAMES[app.shape].toUpperCase(), -200, -300, 1, 1);
}

const FRAMES = { attract: frameAttract, play: framePlay, initials: frameInitials, shapes: frameShapes };
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  app.t += dt;
  app.modeT += dt;
  const inp = input.read({ typing: app.mode === 'initials' });
  if (inp.color) {
    phosphor = nextPhosphor(phosphor);
    app.phosphor = phosphor;
    try { localStorage.setItem(PHOSPHOR_KEY, phosphor); } catch { /* private mode */ }
  }
  if (inp.fullscreen) (document.fullscreenElement ? document.exitFullscreen() : canvas.requestFullscreen()).catch(() => {});
  buf.clear();
  buf.color = PHOSPHOR[app.phosphor];
  FRAMES[app.mode](inp, dt);
  // The attract wordmark sits in the score band. That band is the in-game overlay.
  renderer.setRedLine(app.mode === 'play' ? VIEW.redLinePx : 0);
  renderer.draw(buf, dt);
  requestAnimationFrame(frame);
});
