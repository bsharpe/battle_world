import { clamp } from './math.js';

export const treadsFromArcade = (forward, turn) => ({
  left: clamp(forward + turn, -1, 1),
  right: clamp(forward - turn, -1, 1),
});

const DEADZONE = 0.2;

export function createInput(win = window) {
  const down = new Set();
  const pending = [];
  const prev = { fire: false, start: false, toggle: false, fullscreen: false, color: false };
  let mode = 'arcade';
  win.addEventListener('keydown', (e) => {
    down.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Backspace') e.preventDefault();
    if (e.repeat) return;
    if (/^Key[A-Z]$/.test(e.code)) pending.push(e.code.slice(3));
    else if (e.code === 'Space') pending.push(' ');
    else if (e.code === 'Backspace') pending.push('\b');
  });
  win.addEventListener('keyup', (e) => down.delete(e.code));
  win.addEventListener('blur', () => { down.clear(); pending.length = 0; });
  const k = (code) => (down.has(code) ? 1 : 0);
  const edge = (name, held) => {
    const hit = held && !prev[name];
    prev[name] = held;
    return hit;
  };

  return {
    get mode() { return mode; },
    read(opts = {}) {
      const typed = pending.splice(0).join('');
      let { left, right } =
        mode === 'arcade'
          ? treadsFromArcade(
              Math.max(k('KeyW'), k('ArrowUp')) - Math.max(k('KeyS'), k('ArrowDown')),
              Math.max(k('KeyD'), k('ArrowRight')) - Math.max(k('KeyA'), k('ArrowLeft')),
            )
          : { left: k('KeyQ') - k('KeyA'), right: k('KeyP') - k('KeyL') };
      let fire = down.has('Space'), start = down.has('Enter');
      const pad = Array.from(globalThis.navigator?.getGamepads?.() ?? []).find(Boolean);
      if (pad) {
        const axis = (i) => (Math.abs(pad.axes[i] ?? 0) < DEADZONE ? 0 : -pad.axes[i]);
        if (axis(1) || axis(3)) [left, right] = [axis(1), axis(3)];
        fire ||= [0, 5, 7].some((i) => pad.buttons[i]?.pressed);
        start ||= !!pad.buttons[9]?.pressed;
      }
      const toggle = edge('toggle', down.has('KeyT'));
      // On the initials screen a letter is a letter. C, T, and F must not change the game.
      if (toggle && !opts.typing) mode = mode === 'arcade' ? 'treads' : 'arcade';
      const color = edge('color', down.has('KeyC'));
      const fullscreen = edge('fullscreen', down.has('KeyF'));
      return {
        left, right,
        fire: edge('fire', fire),
        start: edge('start', start),
        fullscreen: opts.typing ? false : fullscreen,
        color: opts.typing ? false : color,
        typed,
      };
    },
  };
}
