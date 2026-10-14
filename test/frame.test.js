import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bitmapSize, fitFrame } from '../src/render/gl.js';

// A 1× bitmap fitted to a retina window is an upscale, which softens the lines.
// The bitmap stops at 2× the picture, and the CSS box is the largest 16:9 frame in the window.

test('a retina display gets a 2× bitmap and a 1× display stays 1×', () => {
  assert.deepEqual(bitmapSize(1920, 1080, 2), [3840, 2160]);
  assert.deepEqual(bitmapSize(1920, 1080, 3), [3840, 2160]);
  assert.deepEqual(bitmapSize(1920, 1080, 1), [1920, 1080]);
});

test('the frame fits inside the window and keeps 16:9', () => {
  assert.deepEqual(fitFrame(1920, 1080, 1440, 900), [1440, 810]);
  assert.deepEqual(fitFrame(1920, 1080, 2000, 900), [1600, 900]);
  const [w, h] = fitFrame(1920, 1080, 1440, 900);
  assert.ok(w <= 1440 && h <= 900);
  assert.ok(Math.abs(w / h - 16 / 9) < 0.01);
});
