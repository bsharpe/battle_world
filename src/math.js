export const TAU = Math.PI * 2;
const WORLD = 65536; // 16-bit world coordinates wrap at ±32768

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const wrapAngle = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
export const wrapCoord = (v) => v - WORLD * Math.floor((v + WORLD / 2) / WORLD);

export const delta = (ax, az, bx, bz) => [wrapCoord(bx - ax), wrapCoord(bz - az)];
export const dist = (ax, az, bx, bz) => Math.hypot(...delta(ax, az, bx, bz));
export function bearing(ax, az, bx, bz) {
  const [dx, dz] = delta(ax, az, bx, bz);
  return Math.atan2(dx, dz);
}

export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hue h in [0, 6): red, yellow, green, cyan, blue, magenta.
export const hueRgb = (h) => [0, 4, 2].map((k) => Math.min(1, Math.max(0, Math.abs(((h + k) % 6) - 3) - 1)));
