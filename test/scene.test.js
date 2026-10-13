import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/data/rom.js';
import { VIEW } from '../src/config.js';
import { createLineBuffer, makeCamera, drawModel } from '../src/render/scene.js';

// A segment crosses the view when it covers the full width or height and still
// meets the rectangle. A short edge that merely sits inside does not.
function spansView(x0, y0, x1, y1, w, h) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  if (!(minX < 0 && maxX > w) && !(minY < 0 && maxY > h)) return false;
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0, w - x0, y0, h - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

test('a box on the world seam does not project a segment across the view', () => {
  // The (−32768, 16384) short box straddles the torus. Wrapping each vertex
  // sends one corner +65536 away, and that edge crosses the 1920×1080 view.
  const buf = createLineBuffer();
  drawModel(buf, makeCamera(0, 0, 0), SHAPES.shortBox, -32768, 0, 16384, Math.PI / 2);
  assert.ok(buf.count > 0, 'the seam box was culled instead of drawn');
  const { width, height } = VIEW;
  for (let i = 0; i < buf.count; i++) {
    const o = i * 5;
    const x0 = buf.data[o], y0 = buf.data[o + 1], x1 = buf.data[o + 2], y1 = buf.data[o + 3];
    assert.ok(
      !spansView(x0, y0, x1, y1, width, height),
      `seam edge spans the ${width}×${height} view (${x0},${y0})-(${x1},${y1})`,
    );
  }
});
