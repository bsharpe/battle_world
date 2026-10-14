import { VIEW } from '../config.js';

// A near-side edge sits on the skin. Farther than this, it is the far side of the same object.
const OWN_SLOP = 96;
// A different object's line this far behind a face is already through it.
const WORLD_SLOP = 16;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function project(cam, p) {
  const f = VIEW.focal;
  return [VIEW.width / 2 + (p[0] * f) / p[2], cam.horizonY - (p[1] * f) / p[2]];
}

// Outward triangles of the convex hull. Coplanar quads become overlapping triangles;
// either one masks the silhouette.
export function hullFaces(verts) {
  const n = verts.length, faces = [], plane = 0.5;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const n0 = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]));
        if (dot(n0, n0) < 2500) continue;
        let pos = false, neg = false;
        for (let p = 0; p < n; p++) {
          if (p === i || p === j || p === k) continue;
          const d = dot(n0, sub(verts[p], verts[i]));
          if (d > plane) pos = true;
          else if (d < -plane) neg = true;
          if (pos && neg) break;
        }
        if (pos === neg) continue;
        faces.push(pos ? [i, k, j] : [i, j, k]);
      }
    }
  }
  return faces;
}

function clipPolyZ(poly, near) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const aIn = a[2] >= near, bIn = b[2] >= near;
    if (aIn && bIn) out.push(b);
    else if (aIn !== bIn) {
      out.push(lerp(a, b, (near - a[2]) / (b[2] - a[2])));
      if (bIn) out.push(b);
    }
  }
  return out;
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i], d = poly[(i + 1) % poly.length];
    a += c[0] * d[1] - d[0] * c[1];
  }
  return Math.abs(a) * 0.5;
}

export function pointInConvex(x, y, poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i], d = poly[(i + 1) % poly.length];
    const cr = (d[0] - c[0]) * (y - c[1]) - (d[1] - c[1]) * (x - c[0]);
    if (Math.abs(cr) < 0.05) continue;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

// Front face of a solid, in view space. Back faces and slivers are omitted.
// ownSlop is how far behind this skin an edge of the same object still counts as
// the near side. Guns and panels sit inside the fender plane; the far side does not.
export function faceOccluder(cam, a, b, c, owner, ownSlop = OWN_SLOP) {
  const n = cross(sub(b, a), sub(c, a));
  if (dot(n, n) < 1) return null;
  const clipped = clipPolyZ([a, b, c], VIEW.near);
  if (clipped.length < 3) return null;
  if (dot(n, clipped[0]) >= 0) return null;
  const poly = clipped.map((q) => project(cam, q));
  if (polyArea(poly) < 8) return null;
  return stamp({ n, np: dot(n, a), poly, owner, ownSlop });
}

export function stamp(face) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of face.poly) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  face.minX = minX; face.maxX = maxX; face.minY = minY; face.maxY = maxY;
  return face;
}

export function convexHull2D(points) {
  const pts = [];
  const seen = new Set();
  for (const p of points) {
    const key = `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push(p);
  }
  if (pts.length < 3) return pts;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list) => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h;
  };
  const lower = build(pts);
  const upper = build(pts.reverse());
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// One outline per object. The landscape is behind every solid, so the outline is enough.
export function silhouettes(occ) {
  const groups = new Map();
  for (const face of occ) {
    let pts = groups.get(face.owner);
    if (!pts) groups.set(face.owner, pts = []);
    for (const p of face.poly) pts.push(p);
  }
  const out = [];
  for (const pts of groups.values()) {
    const poly = convexHull2D(pts);
    if (poly.length >= 3) out.push(stamp({ poly }));
  }
  return out;
}

function quadRoots(a, b, c) {
  const out = [];
  const push = (t) => { if (t > 1e-3 && t < 1 - 1e-3) out.push(t); };
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) > 1e-8) push(-c / b);
    return out;
  }
  const d = b * b - 4 * a * c;
  if (d < 0) return out;
  const s = Math.sqrt(d);
  push((-b - s) / (2 * a));
  push((-b + s) / (2 * a));
  return out;
}

// Where the view-space segment crosses "slop units behind this plane".
function slopCuts(a, b, face, slop) {
  const D = sub(b, a);
  const Na = dot(face.n, a);
  const NdD = dot(face.n, D);
  const c = Na - face.np;
  return quadRoots(
    D[2] * NdD,
    a[2] * NdD + D[2] * c - slop * NdD,
    a[2] * c - slop * Na,
  );
}

function screenCrossT(cam, a, b, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const f = VIEW.focal, cx = VIEW.width / 2, hy = cam.horizonY;
  const side = (p) => ((cx - x0) * p[2] + f * p[0]) * dy - ((hy - y0) * p[2] - f * p[1]) * dx;
  const sa = side(a), sb = side(b);
  const den = sa - sb;
  if (Math.abs(den) < 1e-4) return null;
  const t = sa / den;
  return t > 1e-3 && t < 1 - 1e-3 ? t : null;
}

function missesBox(minX, minY, maxX, maxY, face) {
  return maxX < face.minX || minX > face.maxX || maxY < face.minY || minY > face.maxY;
}

// Hull generation emits a pair of triangles per quad. They share a plane, so one
// screen polygon masks the wall. Hundredths on the unit normal keep faces about
// a degree apart split; whole units of plane distance keep the far wall split.
export function mergeCoplanar(faces) {
  if (faces.length < 2) return faces;
  const groups = new Map();
  for (const face of faces) {
    const len = Math.hypot(face.n[0], face.n[1], face.n[2]);
    const key = `${(face.n[0] / len).toFixed(2)},${(face.n[1] / len).toFixed(2)},${(face.n[2] / len).toFixed(2)},${(face.np / len).toFixed(0)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = []);
    g.push(face);
  }
  if (groups.size === faces.length) return faces;
  const out = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const pts = [];
    for (const face of group) for (const p of face.poly) pts.push(p);
    const poly = convexHull2D(pts);
    if (poly.length < 3) continue;
    const base = group[0];
    out.push(stamp({ n: base.n, np: base.np, poly, owner: base.owner, ownSlop: base.ownSlop }));
  }
  return out;
}

function hiddenAt(cam, p, face, slop) {
  const nd = dot(face.n, p);
  if (Math.abs(nd) < 1e-4) return false;
  const s = face.np / nd;
  if (s <= 0) return false;
  if ((1 - s) * p[2] <= slop) return false;
  const [x, y] = project(cam, p);
  return pointInConvex(x, y, face.poly);
}

function retainVisible(intervals, cuts, hiddenAtT) {
  const next = [];
  for (const [lo, hi] of intervals) {
    const pts = [lo];
    for (const t of cuts) if (t > lo + 1e-4 && t < hi - 1e-4) pts.push(t);
    pts.push(hi);
    pts.sort((p, q) => p - q);
    let run = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = pts[i], t1 = pts[i + 1];
      if (t1 - t0 < 1e-4) continue;
      if (hiddenAtT((t0 + t1) * 0.5)) { run = null; continue; }
      if (run) run[1] = t1;
      else { run = [t0, t1]; next.push(run); }
    }
  }
  return next;
}

// Portions of view-space segment a→b that stay in front of every solid face.
export function visibleSpans(cam, a, b, occ, owner) {
  let intervals = [[0, 1]];
  const [ax, ay] = project(cam, a);
  const [bx, by] = project(cam, b);
  const minX = ax < bx ? ax : bx, maxX = ax < bx ? bx : ax;
  const minY = ay < by ? ay : by, maxY = ay < by ? by : ay;
  for (const face of occ) {
    if (missesBox(minX, minY, maxX, maxY, face)) continue;
    const slop = face.owner === owner && owner ? face.ownSlop : WORLD_SLOP;
    const cuts = slopCuts(a, b, face, slop);
    for (let i = 0; i < face.poly.length; i++) {
      const c = face.poly[i], d = face.poly[(i + 1) % face.poly.length];
      const t = screenCrossT(cam, a, b, c[0], c[1], d[0], d[1]);
      if (t !== null) cuts.push(t);
    }
    intervals = retainVisible(intervals, cuts, (t) => hiddenAt(cam, lerp(a, b, t), face, slop));
    if (!intervals.length) break;
  }
  return intervals;
}

function insideInterval(x0, y0, x1, y1, poly) {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p[0]; cy += p[1]; }
  cx /= poly.length; cy /= poly.length;
  let u0 = 0, u1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const csign = ex * (cy - a[1]) - ey * (cx - a[0]);
    if (Math.abs(csign) < 1e-3) continue;
    const f0 = (ex * (y0 - a[1]) - ey * (x0 - a[0])) * csign;
    const f1 = (ex * (y1 - a[1]) - ey * (x1 - a[0])) * csign;
    if (f0 >= 0 && f1 >= 0) continue;
    if (f0 <= 0 && f1 <= 0) return null;
    const u = f0 / (f0 - f1);
    if (f0 < 0) u0 = Math.max(u0, u);
    else u1 = Math.min(u1, u);
    if (u0 > u1) return null;
  }
  return u0 <= u1 ? [u0, u1] : null;
}

function subtractInterval(intervals, c0, c1) {
  if (c1 - c0 < 1e-4) return intervals;
  const out = [];
  for (const [a, b] of intervals) {
    if (c1 <= a || c0 >= b) { out.push([a, b]); continue; }
    if (c0 > a + 1e-4) out.push([a, c0]);
    if (c1 < b - 1e-4) out.push([c1, b]);
  }
  return out;
}

// Backdrop lines have no depth. Any span inside a front face is behind the object.
export function clipScreenLine(x0, y0, x1, y1, occ) {
  if (!occ.length) return [[x0, y0, x1, y1]];
  if ((x0 - x1) ** 2 + (y0 - y1) ** 2 < 1e-6) {
    return screenCovered(x0, y0, occ) ? [] : [[x0, y0, x1, y1]];
  }
  let intervals = [[0, 1]];
  const minX = x0 < x1 ? x0 : x1, maxX = x0 < x1 ? x1 : x0;
  const minY = y0 < y1 ? y0 : y1, maxY = y0 < y1 ? y1 : y0;
  for (const face of occ) {
    if (missesBox(minX, minY, maxX, maxY, face)) continue;
    const hit = insideInterval(x0, y0, x1, y1, face.poly);
    if (!hit) continue;
    intervals = subtractInterval(intervals, hit[0], hit[1]);
    if (!intervals.length) return [];
  }
  const dx = x1 - x0, dy = y1 - y0;
  return intervals.map(([u0, u1]) => [x0 + dx * u0, y0 + dy * u0, x0 + dx * u1, y0 + dy * u1]);
}

export function screenCovered(x, y, occ) {
  for (const face of occ) {
    if (x < face.minX || x > face.maxX || y < face.minY || y > face.maxY) continue;
    if (pointInConvex(x, y, face.poly)) return true;
  }
  return false;
}
