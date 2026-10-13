// Parses Andy McFadden's annotated Battlezone (rev 2) disassembly into src/data/rom.js.
// Usage: node tools/extract-rom.mjs [saved-listing.html]   (fetches the listing when no file is given)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LISTING_URL = 'https://6502disassembly.com/va-battlezone/Battlezone.html';
const TAU = Math.PI * 2;

const NAMES = {
  0x00: 'narrowPyramid', 0x01: 'tallBox', 0x02: 'tank', 0x03: 'shell', 0x0c: 'widePyramid',
  0x0d: 'radarDish', 0x0e: 'shellBurst', 0x0f: 'shortBox', 0x16: 'missile', 0x17: 'logoBa',
  0x1e: 'logoTtle', 0x1f: 'logoZone', 0x20: 'saucer', 0x21: 'superTank',
};
const shapeName = (id) =>
  NAMES[id] ?? (id <= 0x0b ? `tread${id - 4}` : id >= 0x24 ? `spatter${id - 0x24}` : `chunk${id.toString(16)}`);

export const toText = (html) =>
  html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const hexOperands = (s) => (s.split(';')[0].match(/\$[0-9a-f]{2}\b/g) ?? []).map((h) => parseInt(h.slice(1), 16));

function parseAvg(op, rest) {
  const num = (k) => Number(rest.match(new RegExp(`${k}=([-+]?\\d+)`))?.[1] ?? 0);
  if (op === 'VCTR' || op === 'SVEC') return { op: 'draw', dx: num('dx'), dy: num('dy'), in: num('in'), len: op === 'VCTR' ? 4 : 2 };
  if (op === 'VJSR' || op === 'VJMP') return { op: op === 'VJSR' ? 'jsr' : 'jmp', target: parseInt(rest.match(/\(\$([0-9a-f]{4})\)/)[1], 16), len: 2 };
  if (op === 'VRTS' || op === 'HALT') return { op: 'rts', len: 2 };
  if (op === 'CNTR') return { op: 'center', len: 2 };
  return { op: 'nop', len: 2 }; // STAT, SCAL
}

// Returns { mem: Map<addr, byte>, avg: Map<addr, instr>, glyphs: {char, target}[], strings: {x,y,text}[] }.
export function parseListing(text) {
  const mem = new Map(), avg = new Map(), glyphs = [], strings = [];
  let cont = null, inEnglish = false;
  for (const line of text.split('\n')) {
    if (line.includes('str_addr_en')) inEnglish = true;
    if (line.includes('str_addr_fr')) inEnglish = false;
    const m = line.match(/^([0-9a-f]{4}): ((?:[0-9a-f]{2} )*[0-9a-f]{2})(\+?)/);
    if (m) {
      const addr = parseInt(m[1], 16);
      const bulk = line.match(/\.bulk\s+(.*)/);
      const bytes = m[3] === '+' && bulk ? hexOperands(bulk[1]) : m[2].split(' ').map((h) => parseInt(h, 16));
      bytes.forEach((b, i) => mem.set(addr + i, b));
      cont = m[3] === '+' ? addr + bytes.length : null;
      const ins = line.match(/;(VCTR|SVEC|VJSR|VJMP|VRTS|CNTR|STAT|SCAL|HALT)\b(.*)/);
      if (ins && addr < 0x4000) avg.set(addr, parseAvg(ins[1], ins[2]));
      const glyph = line.match(/;VJSR a=\$[0-9a-f]+ \(\$([0-9a-f]{4})\) '(.)'/);
      if (glyph) glyphs.push({ char: glyph[2], target: parseInt(glyph[1], 16) });
      const str = line.match(/;([-+]\d+),([-+]\d+) '(.*)'\s*$/);
      if (str && inEnglish) strings.push({ x: Number(str[1]), y: Number(str[2]), text: str[3].trim() });
      continue;
    }
    const more = line.match(/^\s+\+\s+(\$.*)/);
    if (more && cont !== null) {
      const bytes = hexOperands(more[1]);
      bytes.forEach((b, i) => mem.set(cont + i, b));
      cont += bytes.length;
    }
  }
  return { mem, avg, glyphs, strings };
}

const word = (mem, a) => mem.get(a) | (mem.get(a + 1) << 8);
const sword = (mem, a) => { const w = word(mem, a); return w & 0x8000 ? w - 0x10000 : w; };

// Shape `id`: vertex table at $388e, draw-command table at $7472 (both 44 little-endian pointers).
export function readShape(mem, id) {
  const va = word(mem, 0x388e + id * 2), ca = word(mem, 0x7472 + id * 2);
  if (!va || !ca || !mem.has(va) || !mem.has(ca)) return null;
  const verts = [];
  for (let i = 0; i < (mem.get(va) - 1) / 6; i++) {
    const p = va + 1 + i * 6;
    const [fwd, right, up] = [sword(mem, p), sword(mem, p + 2), sword(mem, p + 4)];
    verts.push([-right || 0, up, fwd]); // ROM shapes are mirrored left/right
  }
  const segs = [];
  let at = 0, inten = 0;
  for (let p = ca; mem.get(p) !== 0xff && mem.has(p); p++) {
    const b = mem.get(p), v = b >> 3, cmd = b & 7;
    if (cmd === 0) segs.push([v, v, inten]);
    else if (cmd === 1) inten = v;
    else if (cmd === 2 || cmd === 3) at = v;
    else if (cmd === 4) { segs.push([at, v, inten]); at = v; }
    // 5 = AVG projectile explosion (drawn procedurally), 6 = no-op
  }
  return { verts, segs };
}

// Interprets an AVG vector routine. Returns visible strokes [x0,y0,x1,y1,in] and the final beam position.
export function runAvg(avg, start) {
  const segs = [], stack = [];
  let x = 0, y = 0, pc = start;
  for (let guard = 0; guard < 10000; guard++) {
    const ins = avg.get(pc);
    if (!ins) throw new Error(`no AVG instruction at $${pc.toString(16)}`);
    if (ins.op === 'jsr') { stack.push(pc + ins.len); pc = ins.target; continue; }
    if (ins.op === 'jmp') { pc = ins.target; continue; }
    if (ins.op === 'rts') { if (!stack.length) return { segs, end: [x, y] }; pc = stack.pop(); continue; }
    if (ins.op === 'center') { x = 0; y = 0; }
    if (ins.op === 'draw') {
      if (ins.in > 0) segs.push([x, y, x + ins.dx, y + ins.dy, ins.in]);
      x += ins.dx; y += ins.dy;
    }
    pc += ins.len;
  }
  throw new Error(`AVG routine at $${start.toString(16)} never returned`);
}

const jsrList = (avg, addr, max) => {
  const out = [];
  for (let a = addr; avg.get(a)?.op === 'jsr' && out.length < max; a += 2) out.push(runAvg(avg, avg.get(a).target).segs);
  return out;
};

export function buildRom({ mem, avg, glyphs, strings }) {
  const SHAPES = {};
  for (let id = 0; id < 44; id++) {
    const s = readShape(mem, id);
    if (s) SHAPES[shapeName(id)] = s;
  }
  const OBSTACLES = [];
  for (let i = 0; mem.get(0x3fcc + i * 2) !== 0xff && i < 32; i++) {
    OBSTACLES.push({
      type: mem.get(0x3fcc + i * 2),
      facing: (mem.get(0x3fcd + i * 2) / 256) * TAU,
      x: sword(mem, 0x76ab + i * 2),
      z: sword(mem, 0x7681 + i * 2),
    });
  }
  const GLYPHS = Object.fromEntries(glyphs.map((g) => [g.char, runAvg(avg, g.target).segs]));
  const VG = {
    reticle1: runAvg(avg, 0x34cc),
    reticle2: runAvg(avg, 0x3500),
    radar: runAvg(avg, 0x353c),
    life: runAvg(avg, 0x3590),
    cracks: jsrList(avg, 0x36f8, 16),
    landscape: jsrList(avg, 0x3006, 8),
  };
  return { SHAPES, OBSTACLES, GLYPHS, VG, STRINGS: strings };
}

async function main() {
  const file = process.argv[2];
  const html = file ? readFileSync(file, 'utf8') : await (await fetch(LISTING_URL)).text();
  const rom = buildRom(parseListing(toText(html)));
  const body = Object.entries(rom).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`).join('\n');
  writeFileSync(new URL('../src/data/rom.js', import.meta.url), `// GENERATED by tools/extract-rom.mjs from ${LISTING_URL}. Do not edit.\n${body}\n`);
  console.log(`shapes ${Object.keys(rom.SHAPES).length}, obstacles ${rom.OBSTACLES.length}, glyphs ${Object.keys(rom.GLYPHS).length}, strings ${rom.STRINGS.length}, cracks ${rom.VG.cracks.length}, landscape ${rom.VG.landscape.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
