const KEY = 'battlezone.highscores';

export const DEFAULT_SCORES = ['EDR', 'MPH', 'JED', 'DES', 'TKE', 'VKB', 'EL', 'HAD', 'ORR', 'GJR'].map((initials) => ({ score: 5000, initials }));

export function rankFor(table, score) {
  const i = table.findIndex((e) => score > e.score);
  return i === -1 ? (table.length < 10 && score > 0 ? table.length : -1) : i;
}

// Stick turn still walks the alphabet. Typed characters spell the name instead.
export function editInitials(entry, inp, letters) {
  if (inp.start) return true;
  if (inp.typed) {
    for (const ch of inp.typed) {
      if (ch === '\b') {
        entry.pos = Math.max(0, entry.pos - 1);
        continue;
      }
      const i = letters.indexOf(ch);
      if (i < 0 || entry.pos > 2) continue;
      entry.letters[entry.pos] = i;
      if (++entry.pos === 3) return true;
    }
    entry.armed = false;
    return false;
  }
  const turn = (inp.left - inp.right) / 2;
  if (Math.abs(turn) < 0.5) entry.armed = true;
  else if (entry.armed) {
    entry.armed = false;
    entry.letters[entry.pos] = (entry.letters[entry.pos] + Math.sign(turn) + letters.length) % letters.length;
  }
  return !!(inp.fire && ++entry.pos === 3);
}

export function insertScore(table, score, initials) {
  const i = rankFor(table, score);
  return i < 0 ? table : [...table.slice(0, i), { score, initials }, ...table.slice(i)].slice(0, 10);
}

export function loadScores(storage = globalThis.localStorage) {
  try {
    const t = JSON.parse(storage.getItem(KEY));
    if (Array.isArray(t) && t.length && t.every((e) => Number.isFinite(e.score) && typeof e.initials === 'string')) return t;
  } catch {
    // private mode, blocked storage, or corrupt JSON: fall through to defaults
  }
  return DEFAULT_SCORES;
}

export function saveScores(table, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(table));
  } catch {
    // storage unavailable: scores last for this session only
  }
}
