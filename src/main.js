import { createVectorRenderer } from './render/gl.js';
import { createLineBuffer } from './render/scene.js';

const canvas = document.getElementById('screen');
let renderer;
try {
  renderer = createVectorRenderer(canvas);
} catch (err) {
  document.getElementById('error').textContent = `This game needs WebGL2 (${err.message})`;
  throw err;
}
const buf = createLineBuffer();
let last = performance.now(), t = 0;
requestAnimationFrame(function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  buf.clear();
  buf.push(0, 540, 1920, 540, 0.8); // horizon
  for (let i = 0; i < 12; i++) buf.push(100 + i * 140, 700, 160 + i * 140, 1000, (i + 1) / 12); // brightness ramp
  const a = t * 2; // spinning spoke: should leave a short phosphor trail
  buf.push(960, 800, 960 + Math.cos(a) * 200, 800 + Math.sin(a) * 200, 1);
  buf.push(860, 100, 1060, 100, 1); // red zone
  buf.push(1500, 300, 1500, 300, 1); // a point
  renderer.draw(buf, dt);
  requestAnimationFrame(frame);
});
